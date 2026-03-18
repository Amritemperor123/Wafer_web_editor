import { spawn } from "node:child_process";

type IntelAction =
  | "complete"
  | "signature"
  | "definition"
  | "declaration"
  | "references"
  | "rename"
  | "outline";

export type PythonIntelRequest = {
  action: IntelAction;
  path?: string;
  code?: string;
  line?: number;
  col?: number;
  prefix?: string;
  newName?: string;
};

const PYTHON_INTEL_SCRIPT = String.raw`
import ast
import builtins
import io
import json
import keyword
import os
import re
import sys
import tokenize
from collections import defaultdict

IGNORED_DIRS = {'.git', 'node_modules', 'dist', 'build', '.next', '.cache', '__pycache__'}
IDENT_RE = re.compile(r'^[A-Za-z_][A-Za-z0-9_]*$')

def normalize_path(p):
    return p.replace('\\', '/').lstrip('/')

def safe_read(path):
    try:
        with open(path, 'r', encoding='utf-8') as f:
            return f.read()
    except UnicodeDecodeError:
        with open(path, 'r', encoding='latin-1') as f:
            return f.read()

def iter_py_files(root):
    for current, dirs, files in os.walk(root):
        dirs[:] = [d for d in dirs if d not in IGNORED_DIRS]
        for name in files:
            if name.endswith('.py'):
                abs_path = os.path.join(current, name)
                rel = os.path.relpath(abs_path, root).replace('\\', '/')
                yield rel, abs_path

def doc_preview(doc):
    if not doc:
        return ''
    lines = [line.rstrip() for line in doc.strip().splitlines()]
    return '\n'.join(lines[:6])

def line_offsets(text):
    offsets = [0]
    total = 0
    for chunk in text.splitlines(True):
        total += len(chunk)
        offsets.append(total)
    return offsets

def pos_to_offset(offsets, line, col):
    safe_line = max(1, min(line, len(offsets)))
    return offsets[safe_line - 1] + max(0, col)

def symbol_at(text, line, col):
    try:
        for tok in tokenize.generate_tokens(io.StringIO(text).readline):
            if tok.type != tokenize.NAME:
                continue
            (sline, scol) = tok.start
            (eline, ecol) = tok.end
            if sline == line and scol <= col < ecol:
                return tok.string
    except tokenize.TokenError:
        pass
    rows = text.splitlines()
    if line < 1 or line > len(rows):
        return ''
    row = rows[line - 1]
    left = row[:col]
    right = row[col:]
    lm = re.search(r'([A-Za-z_][A-Za-z0-9_]*)$', left)
    rm = re.match(r'^([A-Za-z_][A-Za-z0-9_]*)', right)
    if lm and rm:
        return lm.group(1) + rm.group(1)
    if lm:
        return lm.group(1)
    if rm:
        return rm.group(1)
    return ''

def extract_prefix(text, line, col):
    rows = text.splitlines()
    if line < 1 or line > len(rows):
        return ''
    row = rows[line - 1][:col]
    m = re.search(r'([A-Za-z_][A-Za-z0-9_]*)$', row)
    return m.group(1) if m else ''

def dot_context(text, line, col):
    rows = text.splitlines()
    if line < 1 or line > len(rows):
        return None
    row = rows[line - 1][:col]
    m = re.search(r'([A-Za-z_][A-Za-z0-9_]*)\.([A-Za-z_]*)$', row)
    if not m:
        return None
    return {'object': m.group(1), 'member_prefix': m.group(2)}

def parse_call_context(text, line, col):
    offsets = line_offsets(text)
    cursor = pos_to_offset(offsets, line, col)
    src = text[:cursor]
    depth = 0
    open_idx = -1
    for i in range(len(src) - 1, -1, -1):
        ch = src[i]
        if ch == ')':
            depth += 1
        elif ch == '(':
            if depth == 0:
                open_idx = i
                break
            depth -= 1
    if open_idx < 0:
        return None
    head = src[:open_idx]
    m = re.search(r'([A-Za-z_][A-Za-z0-9_\.]*)\s*$', head)
    if not m:
        return None
    fn = m.group(1)
    section = src[open_idx + 1:]
    active = 0
    depth = 0
    for ch in section:
        if ch in '([{':
            depth += 1
        elif ch in ')]}':
            depth = max(0, depth - 1)
        elif ch == ',' and depth == 0:
            active += 1
    return {'raw_name': fn, 'name': fn.split('.')[-1], 'active_param': active}

class FileAnalyzer(ast.NodeVisitor):
    def __init__(self, rel_path):
        self.rel_path = rel_path
        self.defs = []
        self.outline = []
        self.assignments = []
        self.function_scopes = []
        self.class_members = defaultdict(list)
        self._outline_stack = []
        self._fn_stack = []
        self._class_stack = []

    def _push_outline(self, node, kind, name, signature='', doc=''):
        entry = {
            'name': name,
            'kind': kind,
            'line': int(getattr(node, 'lineno', 1)),
            'col': int(getattr(node, 'col_offset', 0)) + 1,
            'signature': signature,
            'doc': doc_preview(doc),
            'children': [],
        }
        if self._outline_stack:
            self._outline_stack[-1]['children'].append(entry)
        else:
            self.outline.append(entry)
        self._outline_stack.append(entry)

    def _pop_outline(self):
        self._outline_stack.pop()

    def _add_def(self, node, name, kind, signature='', doc=''):
        self.defs.append({
            'name': name,
            'kind': kind,
            'path': self.rel_path,
            'line': int(getattr(node, 'lineno', 1)),
            'col': int(getattr(node, 'col_offset', 0)) + 1,
            'signature': signature,
            'doc': doc_preview(doc),
        })

    def _signature(self, node):
        if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            return ''
        args = []
        all_args = list(node.args.posonlyargs) + list(node.args.args)
        defaults = [None] * (len(all_args) - len(node.args.defaults)) + list(node.args.defaults)
        for arg, default in zip(all_args, defaults):
            text = arg.arg
            if default is not None:
                text += '=...'
            args.append(text)
        if node.args.vararg:
            args.append('*' + node.args.vararg.arg)
        for kw in node.args.kwonlyargs:
            args.append(kw.arg + '=...')
        if node.args.kwarg:
            args.append('**' + node.args.kwarg.arg)
        return f"{node.name}({', '.join(args)})"

    def visit_ClassDef(self, node):
        doc = ast.get_docstring(node) or ''
        self._add_def(node, node.name, 'class', f'{node.name}(...)', doc)
        self._push_outline(node, 'class', node.name, f'{node.name}(...)', doc)
        self._class_stack.append(node.name)
        self.generic_visit(node)
        self._class_stack.pop()
        self._pop_outline()

    def visit_FunctionDef(self, node):
        doc = ast.get_docstring(node) or ''
        sig = self._signature(node)
        kind = 'method' if self._class_stack else 'function'
        self._add_def(node, node.name, kind, sig, doc)
        if self._class_stack:
            self.class_members[self._class_stack[-1]].append({
                'name': node.name,
                'kind': 'method',
                'signature': sig,
                'doc': doc_preview(doc),
                'path': self.rel_path,
                'line': int(getattr(node, 'lineno', 1)),
                'col': int(getattr(node, 'col_offset', 0)) + 1,
            })
        self._push_outline(node, kind, node.name, sig, doc)
        scope = {
            'name': node.name,
            'start': int(getattr(node, 'lineno', 1)),
            'end': int(getattr(node, 'end_lineno', getattr(node, 'lineno', 1))),
            'locals': set(arg.arg for arg in node.args.args),
        }
        if node.args.vararg:
            scope['locals'].add(node.args.vararg.arg)
        if node.args.kwarg:
            scope['locals'].add(node.args.kwarg.arg)
        self._fn_stack.append(scope)
        self.generic_visit(node)
        self._fn_stack.pop()
        scope['locals'] = sorted(scope['locals'])
        self.function_scopes.append(scope)
        self._pop_outline()

    def visit_AsyncFunctionDef(self, node):
        self.visit_FunctionDef(node)

    def _capture_targets(self, target):
        names = []
        if isinstance(target, ast.Name):
            names.append(target.id)
        elif isinstance(target, (ast.Tuple, ast.List)):
            for item in target.elts:
                names.extend(self._capture_targets(item))
        return names

    def visit_Assign(self, node):
        names = []
        for target in node.targets:
            names.extend(self._capture_targets(target))
        for name in names:
            self._add_def(node, name, 'variable', '', '')
            if self._fn_stack:
                self._fn_stack[-1]['locals'].add(name)
        if isinstance(node.value, ast.Call) and isinstance(node.value.func, ast.Name):
            class_name = node.value.func.id
            for name in names:
                self.assignments.append({
                    'name': name,
                    'className': class_name,
                    'line': int(getattr(node, 'lineno', 1)),
                })
        self.generic_visit(node)

    def visit_For(self, node):
        for name in self._capture_targets(node.target):
            if self._fn_stack:
                self._fn_stack[-1]['locals'].add(name)
        self.generic_visit(node)

def analyze_file(path, text):
    try:
        tree = ast.parse(text)
    except SyntaxError:
        return {
            'defs': [],
            'outline': [],
            'assignments': [],
            'function_scopes': [],
            'class_members': {},
            'error': 'syntax',
        }
    analyzer = FileAnalyzer(path)
    analyzer.visit(tree)
    return {
        'defs': analyzer.defs,
        'outline': analyzer.outline,
        'assignments': analyzer.assignments,
        'function_scopes': analyzer.function_scopes,
        'class_members': dict(analyzer.class_members),
        'error': '',
    }

def collect_name_tokens(path, text):
    out = []
    lines = text.splitlines()
    try:
        for tok in tokenize.generate_tokens(io.StringIO(text).readline):
            if tok.type != tokenize.NAME:
                continue
            line = tok.start[0]
            col = tok.start[1]
            ecol = tok.end[1]
            snippet = lines[line - 1].strip() if 1 <= line <= len(lines) else ''
            out.append({
                'name': tok.string,
                'path': path,
                'line': line,
                'col': col + 1,
                'endCol': ecol + 1,
                'snippet': snippet[:180],
            })
    except tokenize.TokenError:
        return out
    return out

def build_index(workspace_root, overlays):
    defs_by_name = defaultdict(list)
    refs_by_name = defaultdict(list)
    outlines = {}
    file_defs = defaultdict(list)
    class_members = defaultdict(list)
    assignments_by_file = defaultdict(list)
    fn_scopes_by_file = defaultdict(list)
    file_texts = {}

    for rel, abs_path in iter_py_files(workspace_root):
        text = overlays.get(rel)
        if text is None:
            text = safe_read(abs_path)
        file_texts[rel] = text
        parsed = analyze_file(rel, text)
        outlines[rel] = parsed['outline']
        for d in parsed['defs']:
            defs_by_name[d['name']].append(d)
            file_defs[rel].append(d)
        for cls, members in parsed['class_members'].items():
            class_members[cls].extend(members)
        assignments_by_file[rel].extend(parsed['assignments'])
        fn_scopes_by_file[rel].extend(parsed['function_scopes'])
        for token in collect_name_tokens(rel, text):
            refs_by_name[token['name']].append(token)

    for name in defs_by_name:
        defs_by_name[name].sort(key=lambda d: (d['path'], d['line'], d['col']))
    return {
        'defs_by_name': defs_by_name,
        'refs_by_name': refs_by_name,
        'outlines': outlines,
        'file_defs': file_defs,
        'class_members': class_members,
        'assignments_by_file': assignments_by_file,
        'fn_scopes_by_file': fn_scopes_by_file,
        'file_texts': file_texts,
    }

def lookup_definition(name, current_path, line, index):
    local_defs = [d for d in index['file_defs'].get(current_path, []) if d['name'] == name and d['line'] <= line]
    if local_defs:
        return sorted(local_defs, key=lambda d: d['line'], reverse=True)[0]
    defs = index['defs_by_name'].get(name, [])
    return defs[0] if defs else None

def infer_member_candidates(current_path, line, obj_name, index):
    class_name = None
    assignments = index['assignments_by_file'].get(current_path, [])
    for item in assignments:
        if item['name'] == obj_name and item['line'] <= line:
            class_name = item['className']
    if class_name:
        return index['class_members'].get(class_name, [])
    return []

def do_complete(req, index):
    path = req.get('path', '')
    code = req.get('code') or index['file_texts'].get(path, '')
    line = int(req.get('line') or 1)
    col = int(req.get('col') or 1) - 1
    prefix = req.get('prefix') or extract_prefix(code, line, col)
    dot = dot_context(code, line, col)
    items = []
    seen = set()
    if dot:
        members = infer_member_candidates(path, line, dot['object'], index)
        for member in members:
            name = member['name']
            if not name.startswith(dot['member_prefix']):
                continue
            if name in seen:
                continue
            seen.add(name)
            items.append({
                'name': name,
                'kind': member.get('kind', 'member'),
                'detail': member.get('signature', ''),
                'doc': member.get('doc', ''),
            })
        return {'symbol': dot['member_prefix'], 'items': items[:100]}

    pool = set(keyword.kwlist) | set(dir(builtins)) | set(index['defs_by_name'].keys())
    scopes = index['fn_scopes_by_file'].get(path, [])
    for scope in scopes:
        if scope['start'] <= line <= scope['end']:
            pool.update(scope['locals'])
    for candidate in sorted(pool):
        if prefix and not candidate.startswith(prefix):
            continue
        if candidate in seen:
            continue
        seen.add(candidate)
        d = lookup_definition(candidate, path, line, index)
        items.append({
            'name': candidate,
            'kind': d['kind'] if d else ('keyword' if keyword.iskeyword(candidate) else 'symbol'),
            'detail': (d or {}).get('signature', ''),
            'doc': (d or {}).get('doc', ''),
        })
        if len(items) >= 120:
            break
    return {'symbol': prefix, 'items': items}

def do_signature(req, index):
    path = req.get('path', '')
    code = req.get('code') or index['file_texts'].get(path, '')
    line = int(req.get('line') or 1)
    col = int(req.get('col') or 1) - 1
    ctx = parse_call_context(code, line, col)
    if not ctx:
        return {'signature': None}
    definition = lookup_definition(ctx['name'], path, line, index)
    if not definition and '.' in ctx['raw_name']:
        dot = dot_context(code, line, col)
        if dot:
            members = infer_member_candidates(path, line, dot['object'], index)
            for member in members:
                if member['name'] == ctx['name']:
                    definition = member
                    break
    if not definition:
        return {'signature': None}
    return {
        'signature': {
            'symbol': ctx['name'],
            'label': definition.get('signature') or f"{ctx['name']}(...)",
            'activeParam': ctx['active_param'],
            'doc': definition.get('doc', ''),
            'path': definition.get('path', path),
            'line': definition.get('line', 1),
            'col': definition.get('col', 1),
        }
    }

def do_definition(req, index):
    path = req.get('path', '')
    code = req.get('code') or index['file_texts'].get(path, '')
    line = int(req.get('line') or 1)
    col = int(req.get('col') or 1) - 1
    symbol = req.get('symbol') or symbol_at(code, line, col)
    if not symbol:
        return {'symbol': '', 'location': None}
    definition = lookup_definition(symbol, path, line, index)
    if not definition:
        return {'symbol': symbol, 'location': None}
    return {'symbol': symbol, 'location': definition}

def do_references(req, index):
    path = req.get('path', '')
    code = req.get('code') or index['file_texts'].get(path, '')
    line = int(req.get('line') or 1)
    col = int(req.get('col') or 1) - 1
    symbol = req.get('symbol') or symbol_at(code, line, col)
    if not symbol:
        return {'symbol': '', 'references': []}
    refs = index['refs_by_name'].get(symbol, [])
    refs = sorted(refs, key=lambda r: (r['path'], r['line'], r['col']))
    return {'symbol': symbol, 'references': refs[:1000]}

def apply_edits(text, edits):
    offsets = line_offsets(text)
    patched = text
    spans = []
    for edit in edits:
        start = pos_to_offset(offsets, int(edit['line']), int(edit['col']) - 1)
        end = pos_to_offset(offsets, int(edit['line']), int(edit['endCol']) - 1)
        spans.append((start, end))
    spans.sort(reverse=True)
    for start, end in spans:
        patched = patched[:start] + edit_new_name + patched[end:]
    return patched

def do_rename(req, index, workspace_root):
    path = req.get('path', '')
    code = req.get('code') or index['file_texts'].get(path, '')
    line = int(req.get('line') or 1)
    col = int(req.get('col') or 1) - 1
    new_name = (req.get('newName') or '').strip()
    if not IDENT_RE.match(new_name):
        return {'error': "New symbol name must be a valid Python identifier"}
    symbol = req.get('symbol') or symbol_at(code, line, col)
    if not symbol:
        return {'error': 'No symbol under cursor'}
    refs = index['refs_by_name'].get(symbol, [])
    grouped = defaultdict(list)
    for ref in refs:
        grouped[ref['path']].append(ref)
    updated_files = []
    for rel, edits in grouped.items():
        text = index['file_texts'].get(rel, '')
        offsets = line_offsets(text)
        spans = []
        for ref in edits:
            start = pos_to_offset(offsets, int(ref['line']), int(ref['col']) - 1)
            end = pos_to_offset(offsets, int(ref['line']), int(ref['endCol']) - 1)
            spans.append((start, end))
        spans.sort(reverse=True)
        patched = text
        for start, end in spans:
            patched = patched[:start] + new_name + patched[end:]
        if patched != text:
            abs_path = os.path.join(workspace_root, rel)
            with open(abs_path, 'w', encoding='utf-8') as f:
                f.write(patched)
            updated_files.append({'path': rel, 'content': patched})
    return {
        'symbol': symbol,
        'newName': new_name,
        'updatedFiles': updated_files,
        'updatedCount': len(updated_files),
        'referenceCount': len(refs),
    }

def do_outline(req, index):
    path = req.get('path', '')
    return {'path': path, 'outline': index['outlines'].get(path, [])}

def main():
    payload = json.loads(sys.stdin.read() or '{}')
    workspace_root = payload.get('workspaceRoot', '')
    action = payload.get('action')
    overlays = {}
    req_path = normalize_path(payload.get('path', '') or '')
    if req_path and isinstance(payload.get('code'), str):
        overlays[req_path] = payload.get('code')
    index = build_index(workspace_root, overlays)

    if action == 'complete':
        out = do_complete(payload, index)
    elif action == 'signature':
        out = do_signature(payload, index)
    elif action in ('definition', 'declaration'):
        out = do_definition(payload, index)
    elif action == 'references':
        out = do_references(payload, index)
    elif action == 'rename':
        out = do_rename(payload, index, workspace_root)
    elif action == 'outline':
        out = do_outline(payload, index)
    else:
        out = {'error': f'Unsupported action: {action}'}
    print(json.dumps(out))

if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        print(json.dumps({'error': str(exc)}))
        sys.exit(1)
`;

export const runPythonIntel = async (
  pythonBin: string,
  workspaceRoot: string,
  request: PythonIntelRequest,
): Promise<unknown> => {
  return new Promise((resolve, reject) => {
    const child = spawn(pythonBin, ["-c", PYTHON_INTEL_SCRIPT], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (error) => reject(error));

    const payload = JSON.stringify({
      workspaceRoot,
      ...request,
      path: request.path?.replace(/\\/g, "/"),
    });
    child.stdin.write(payload);
    child.stdin.end();

    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr || stdout || "Python intelligence process failed"));
        return;
      }
      try {
        resolve(JSON.parse(stdout || "{}"));
      } catch {
        reject(new Error(`Failed to parse intelligence output: ${stdout}`));
      }
    });
  });
};
