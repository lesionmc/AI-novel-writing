/**
 * 契约漂移检查（无副作用版）：
 *   ① 后端现状 openapi ≠ 仓库里提交的 docs/openapi.json  → 漂移（后端改了没导出）
 *   ② 由提交的 openapi.json 生成的类型 ≠ src/types/api.gen.ts → 漂移（导出了没重新生成）
 * 全部在临时文件里比对，绝不原地改写仓库文件 —— "检查"不该有写副作用。
 *
 * 用法：npm run check:contract
 * 注意：api.gen.ts 目前尚未被业务代码消费（手写 d.ts 仍是运行时契约），
 * 本脚本守的是"契约快照与后端一致"；类型迁移到手写→生成是后续独立任务。
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..', '..');
const py = existsSync(path.join(root, '.venv', 'Scripts', 'python.exe'))
  ? path.join(root, '.venv', 'Scripts', 'python.exe')
  : path.join(root, '.venv', 'bin', 'python');
if (!existsSync(py)) {
  console.error(`找不到虚拟环境（期望 ${py}）—— 先双击 start.bat 建好 .venv，或手动跑 npm run gen:api`);
  process.exit(1);
}

const committedSpec = path.join(root, 'docs', 'openapi.json');
const tmpSpec = path.join(os.tmpdir(), `openapi.check.${Date.now()}.json`);
const tmpTypes = path.join(os.tmpdir(), `api.gen.check.${Date.now()}.ts`);

const read = (p) => readFileSync(p, 'utf8');
const same = (a, b) => read(a) === read(b);

try {
  execFileSync(py, [path.join(root, 'docs', 'tools', 'export_openapi.py'), tmpSpec], {
    stdio: 'inherit',
  });
  if (existsSync(committedSpec) && !same(committedSpec, tmpSpec)) {
    console.error('契约漂移：后端接口与已提交的 docs/openapi.json 不一致。请跑 npm run gen:api 并提交产物。');
    process.exit(1);
  }

  execFileSync('npx', ['openapi-typescript', tmpSpec, '-o', tmpTypes], {
    cwd: path.join(root, 'frontend'),
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  const committedTypes = path.join(root, 'frontend', 'src', 'types', 'api.gen.ts');
  if (!existsSync(committedTypes)) {
    console.error('缺少 src/types/api.gen.ts —— 先跑 npm run gen:api 并提交');
    process.exit(1);
  }
  if (!same(committedTypes, tmpTypes)) {
    console.error('契约漂移：openapi.json 与 api.gen.ts 不同步。请跑 npm run gen:api 并提交。');
    process.exit(1);
  }
  console.log('契约一致 ✓ 后端 → openapi.json → api.gen.ts 两级无漂移');
} finally {
  rmSync(tmpSpec, { force: true });
  rmSync(tmpTypes, { force: true });
}
