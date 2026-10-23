import { beforeEach, expect, it, vi } from 'vitest'
import {
  registerShoppingExpense,
  shoppingExpenseCategory,
} from './purchaseService'
import type { ShoppingItem } from './model'
const m = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
  update: vi.fn(),
  months: vi.fn(),
  writeMonths: vi.fn(),
  transaction: vi.fn(),
}))
vi.mock('../../lib/firebase/client', () => ({
  getFirebaseServices: async () => ({ db: 'db' }),
}))
vi.mock('../finance/settlementService', () => ({
  prepareExpenseMonths: m.months,
}))
vi.mock('firebase/firestore', () => ({
  collection: (...p: unknown[]) => p.join('/'),
  doc: (...p: unknown[]) =>
    p.length === 1
      ? { id: 'expense-new', path: `${p[0]}/expense-new` }
      : p.join('/'),
  serverTimestamp: () => 'server',
  runTransaction: m.transaction,
  getDocFromServer: m.get,
}))
const item = {
  id: 's',
  title: '牛乳',
  category: 'food',
  quantity: '2',
  unit: '本',
  budget: 500,
  priority: 2,
  assigneeIds: ['b'],
  purchased: false,
  version: 1,
} as ShoppingItem
const input = {
  type: 'expense' as const,
  title: '牛乳',
  amount: 101,
  date: '2026-10-23',
  categoryId: 'expense_food',
  memo: '',
  sharing: { payerId: 'a', shares: { a: 50, b: 50 } },
}
const snapshot = (data: unknown) => ({
  exists: () => Boolean(data),
  data: () => data,
})
beforeEach(() => {
  vi.clearAllMocks()
  m.transaction.mockImplementation(
    async (_: unknown, cb: (tx: typeof m) => unknown) => cb(m),
  )
  m.get.mockImplementation(async (ref: string | { path: string }) => {
    const path = typeof ref === 'string' ? ref : ref.path
    return snapshot(
      path.endsWith('/shoppingItems/s')
        ? item
        : path.includes('financeCategories')
          ? {
              id: 'expense_food',
              type: 'expense',
              name: '食費',
              archived: false,
            }
          : null,
    )
  })
  m.months.mockResolvedValue(m.writeMonths)
})
it('maps only matching active standard expense categories without choosing another silently', () => {
  expect(
    shoppingExpenseCategory('food', [
      { id: 'expense_food', type: 'expense', name: '食費', archived: false },
    ]),
  ).toBe('expense_food')
  expect(
    shoppingExpenseCategory('food', [
      { id: 'expense_food', type: 'expense', name: '食費', archived: true },
    ]),
  ).toBe('')
  expect(
    shoppingExpenseCategory('appliances', [
      {
        id: 'expense_furniture',
        type: 'expense',
        name: '家具家電',
        archived: false,
      },
    ]),
  ).toBe('expense_furniture')
})
it('atomically creates expense, permanent marker, purchase update and settlement month; amount is real total', async () => {
  await registerShoppingExpense('h', 'a', item, input)
  expect(m.set).toHaveBeenCalledWith(
    expect.objectContaining({ id: 'expense-new' }),
    expect.objectContaining({
      amount: 101,
      shoppingItemId: 's',
      sharing: input.sharing,
      version: 1,
      createdAt: 'server',
    }),
  )
  expect(m.set).toHaveBeenCalledWith(
    'db/households/h/shoppingExpenseLinks/s',
    expect.objectContaining({ expenseId: 'expense-new', createdBy: 'a' }),
  )
  expect(m.update).toHaveBeenCalledWith(
    'db/households/h/shoppingItems/s',
    expect.objectContaining({
      purchased: true,
      expenseId: 'expense-new',
      version: 2,
    }),
  )
  expect(m.writeMonths).toHaveBeenCalledOnce()
  expect(m.months).toHaveBeenCalledWith(
    expect.anything(),
    'db',
    'h',
    'a',
    'expense-new',
    null,
    expect.objectContaining({ amount: 101 }),
  )
})
it('rejects stale/deleted/already linked items, invalid category and zero amount without writes', async () => {
  for (const current of [
    null,
    { ...item, version: 2 },
    { ...item, expenseId: 'existing' },
  ]) {
    m.get.mockResolvedValueOnce(snapshot(current))
    await expect(
      registerShoppingExpense('h', 'a', item, input),
    ).rejects.toBeTruthy()
  }
  m.get.mockImplementation(async (ref: string | { path: string }) => {
    const path = typeof ref === 'string' ? ref : ref.path
    return snapshot(
      path.includes('shoppingItems')
        ? item
        : path.includes('shoppingExpenseLinks')
          ? { expenseId: 'deleted-expense' }
          : null,
    )
  })
  await expect(
    registerShoppingExpense('h', 'a', item, input),
  ).rejects.toBeTruthy()
  expect(m.set).not.toHaveBeenCalled()
  expect(m.update).not.toHaveBeenCalled()
})
it('validates current server category, input and online state; later registration also increments item version', async () => {
  await expect(
    registerShoppingExpense('h', 'a', item, { ...input, amount: 0 }),
  ).rejects.toThrow('金額は')
  await expect(
    registerShoppingExpense('h', 'a', item, { ...input, type: 'income' }),
  ).rejects.toBeTruthy()
  m.get.mockImplementation(async (ref: string | { path: string }) => {
    const path = typeof ref === 'string' ? ref : ref.path
    return snapshot(
      path.includes('shoppingItems')
        ? { ...item, purchased: true }
        : path.includes('financeCategories')
          ? { type: 'expense', name: '食費', archived: true }
          : null,
    )
  })
  await expect(
    registerShoppingExpense('h', 'a', { ...item, purchased: true }, input),
  ).rejects.toThrow('カテゴリ')
  expect(m.set).not.toHaveBeenCalled()
  vi.stubGlobal('navigator', { onLine: false })
  await expect(
    registerShoppingExpense('h', 'a', item, input),
  ).rejects.toMatchObject({ code: 'offline' })
  vi.unstubAllGlobals()
})

it('registers an already purchased item with null sharing and the current version', async () => {
  m.get.mockImplementation(async (ref: string | { path: string }) => {
    const path = typeof ref === 'string' ? ref : ref.path
    return snapshot(
      path.includes('shoppingItems')
        ? { ...item, purchased: true, version: 7 }
        : path.includes('financeCategories')
          ? { type: 'expense', name: '食費', archived: false }
          : null,
    )
  })
  await registerShoppingExpense(
    'h',
    'a',
    { ...item, purchased: true, version: 7 },
    { ...input, sharing: null },
  )
  expect(m.update).toHaveBeenCalledWith(
    'db/households/h/shoppingItems/s',
    expect.objectContaining({ purchased: true, version: 8 }),
  )
  expect(m.set).toHaveBeenCalledWith(
    expect.objectContaining({ id: 'expense-new' }),
    expect.objectContaining({ sharing: null, amount: 101 }),
  )
})

it('classifies permission-denied contention only after fresh readable documents confirm a change', async () => {
  m.transaction.mockRejectedValueOnce({ code: 'permission-denied' })
  m.get.mockImplementation(async () => snapshot({ ...item, version: 2 }))
  // A marker was found: another request already succeeded.
  await expect(registerShoppingExpense('h', 'a', item, input)).rejects.toThrow(
    '登録済み',
  )
  m.transaction.mockRejectedValueOnce({ code: 'permission-denied' })
  m.get.mockResolvedValue(snapshot(null))
  await expect(
    registerShoppingExpense('h', 'a', item, input),
  ).rejects.toMatchObject({ code: 'finance-conflict' })
  m.transaction.mockRejectedValueOnce({ code: 'permission-denied' })
  m.get.mockImplementation(async (ref: string) =>
    snapshot(ref.includes('shoppingItems') ? item : null),
  )
  await expect(
    registerShoppingExpense('h', 'a', item, input),
  ).rejects.toMatchObject({ code: 'permission-denied' })
  m.transaction.mockRejectedValueOnce({ code: 'permission-denied' })
  m.get.mockRejectedValueOnce({ code: 'permission-denied' })
  await expect(
    registerShoppingExpense('h', 'a', item, input),
  ).rejects.toMatchObject({ code: 'permission-denied' })
  expect(m.set).not.toHaveBeenCalled()
  expect(m.update).not.toHaveBeenCalled()
})
