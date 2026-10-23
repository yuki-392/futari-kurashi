import { existsSync, readdirSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { spawn } from 'node:child_process'
const suites = {
  'shopping-expenses':
    'node scripts/test-shopping-expense-rules.mjs && node scripts/test-shopping-expenses.mjs',
  'shopping-expense-rules': 'node scripts/test-shopping-expense-rules.mjs',
  'house-rules':
    'node scripts/test-house-rules-rules.mjs && node scripts/test-house-rules.mjs',
  'house-rules-permissions': 'node scripts/test-house-rules-rules.mjs',
  settlement:
    'node scripts/test-settlement-rules.mjs && node scripts/test-settlement.mjs',
  'settlement-rules': 'node scripts/test-settlement-rules.mjs',
  'budget-rules': 'node scripts/test-budget-rules.mjs',
  'declutter-rules': 'node scripts/test-declutter-rules.mjs',
  'finance-rules': 'node scripts/test-finance-rules.mjs',
  finance:
    'node scripts/test-finance-rules.mjs && node scripts/test-budget-rules.mjs && node scripts/test-settlement-rules.mjs && node scripts/test-finance.mjs && node scripts/test-settlement.mjs',
  declutter:
    'node scripts/test-declutter-rules.mjs && node scripts/test-declutter.mjs',
  'shopping-rules': 'node scripts/test-shopping-rules.mjs',
  shopping:
    'node scripts/test-shopping-rules.mjs && node scripts/test-shopping.mjs',
  rules:
    'node scripts/test-household-rules.mjs && node scripts/test-task-rules.mjs && node scripts/test-recurring-rules.mjs && node scripts/test-cleaning-rules.mjs && node scripts/test-shopping-rules.mjs && node scripts/test-declutter-rules.mjs && node scripts/test-finance-rules.mjs && node scripts/test-budget-rules.mjs && node scripts/test-settlement-rules.mjs && node scripts/test-house-rules-rules.mjs && node scripts/test-shopping-expense-rules.mjs',
  'cleaning-rules': 'node scripts/test-cleaning-rules.mjs',
  cleaning:
    'node scripts/test-cleaning-rules.mjs && node scripts/test-recurring.mjs',
  'recurring-rules': 'node scripts/test-recurring-rules.mjs',
  'task-rules': 'node scripts/test-task-rules.mjs',
  auth: 'node scripts/test-auth.mjs',
  household: 'node scripts/test-household.mjs',
  recurring:
    'node scripts/test-recurring-rules.mjs && node scripts/test-recurring.mjs',
  tasks: 'node scripts/test-task-rules.mjs && node scripts/test-tasks.mjs',
  all: 'node scripts/test-household-rules.mjs && node scripts/test-task-rules.mjs && node scripts/test-recurring-rules.mjs && node scripts/test-cleaning-rules.mjs && node scripts/test-shopping-rules.mjs && node scripts/test-declutter-rules.mjs && node scripts/test-finance-rules.mjs && node scripts/test-budget-rules.mjs && node scripts/test-settlement-rules.mjs && node scripts/test-house-rules-rules.mjs && node scripts/test-shopping-expense-rules.mjs && node scripts/test-auth.mjs && node scripts/test-household.mjs && node scripts/test-tasks.mjs && node scripts/test-recurring.mjs && node scripts/test-shopping.mjs && node scripts/test-declutter.mjs && node scripts/test-finance.mjs && node scripts/test-settlement.mjs && node scripts/test-house-rules.mjs && node scripts/test-shopping-expenses.mjs',
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
    [
      'rules',
      'task-rules',
      'recurring-rules',
      'cleaning-rules',
      'shopping-rules',
      'shopping-expense-rules',
      'declutter-rules',
      'finance-rules',
      'budget-rules',
      'settlement-rules',
      'house-rules-permissions',
    ].includes(suite)
      ? 'firestore'
      : 'auth,firestore',
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
