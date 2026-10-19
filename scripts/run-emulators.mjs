import { existsSync, readdirSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { spawn } from 'node:child_process'
const suites = {
  rules: 'node scripts/test-household-rules.mjs',
  auth: 'node scripts/test-auth.mjs',
  household: 'node scripts/test-household.mjs',
  all: 'node scripts/test-household-rules.mjs && node scripts/test-auth.mjs && node scripts/test-household.mjs',
}
const suite = process.argv[2]
if (!Object.hasOwn(suites, suite))
  throw new Error('Unknown emulator test suite')
const env = { ...process.env }
if (!env.JAVA_HOME && existsSync('.tools.local')) {
  const local = readdirSync('.tools.local').find((name) =>
    name.startsWith('jdk-21'),
  )
  if (local) {
    const root = resolve('.tools.local', local)
    env.JAVA_HOME = existsSync(join(root, 'Contents/Home'))
      ? join(root, 'Contents/Home')
      : root
  }
}
if (env.JAVA_HOME) env.PATH = join(env.JAVA_HOME, 'bin') + ':' + env.PATH
const child = spawn(
  process.execPath,
  [
    resolve('node_modules/firebase-tools/lib/bin/firebase.js'),
    'emulators:exec',
    '--only',
    suite === 'rules' ? 'firestore' : 'auth,firestore',
    '--project',
    'demo-futari-kurashi',
    suites[suite],
  ],
  { env, stdio: 'inherit' },
)
child.on('error', () => {
  process.exitCode = 1
})
child.on('exit', (code) => {
  process.exitCode = code ?? 1
})
