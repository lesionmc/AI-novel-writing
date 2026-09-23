/**
 * 重新生成契约产物：后端 openapi.json + 前端 api.gen.ts（两步一起，防只做一半）。
 * 用法：npm run gen:api（改了后端接口后跑，产物连同代码一起提交）
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..', '..');
const py = existsSync(path.join(root, '.venv', 'Scripts', 'python.exe'))
  ? path.join(root, '.venv', 'Scripts', 'python.exe')
  : path.join(root, '.venv', 'bin', 'python');
if (!existsSync(py)) {
  console.error(`找不到虚拟环境（期望 ${py}）—— 先双击 start.bat 建好 .venv`);
  process.exit(1);
}

execFileSync(py, [path.join(root, 'docs', 'tools', 'export_openapi.py')], { stdio: 'inherit' });
execFileSync('npx', ['openapi-typescript', '../docs/openapi.json', '-o', 'src/types/api.gen.ts'], {
  cwd: path.join(root, 'frontend'),
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
console.log('契约产物已刷新：docs/openapi.json + frontend/src/types/api.gen.ts');
