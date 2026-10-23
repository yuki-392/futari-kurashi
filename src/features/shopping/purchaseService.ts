import {
  collection,
  getDocFromServer,
  doc,
  runTransaction,
  serverTimestamp,
} from 'firebase/firestore'
import { getFirebaseServices } from '../../lib/firebase/client'
import { cleanFinanceEntry } from '../finance/model'
import type { FinanceCategory, FinanceEntryInput } from '../finance/model'
import { prepareExpenseMonths } from '../finance/settlementService'
import type { ShoppingInput, ShoppingItem } from './model'
export function shoppingExpenseCategory(
  category: ShoppingInput['category'],
  categories: Pick<FinanceCategory, 'id' | 'type' | 'name' | 'archived'>[],
) {
  const id = {
    food: 'expense_food',
    daily: 'expense_daily',
    furniture: 'expense_furniture',
    appliances: 'expense_furniture',
    other: 'expense_other',
  }[category]
  return categories.some(
    (c) => c.id === id && c.type === 'expense' && !c.archived,
  )
    ? id
    : ''
}
export async function registerShoppingExpense(
  hid: string,
  uid: string,
  expected: ShoppingItem,
  input: FinanceEntryInput,
) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false)
    throw Object.assign(new Error(), { code: 'offline' })
  if (input.type !== 'expense')
    throw new Error('買い物からは支出だけを登録できます。')
  const { db } = await getFirebaseServices(),
    item = doc(db, 'households', hid, 'shoppingItems', expected.id),
    link = doc(db, 'households', hid, 'shoppingExpenseLinks', expected.id),
    expense = doc(collection(db, 'households', hid, 'expenses'))
  try {
    await runTransaction(db, async (tx) => {
      const [current, registered, category, existing] = await Promise.all([
        tx.get(item),
        tx.get(link),
        tx.get(
          doc(db, 'households', hid, 'financeCategories', input.categoryId),
        ),
        tx.get(expense),
      ])
      if (registered.exists() || current.data()?.expenseId)
        throw new Error(
          'この買い物は支出に登録済みです。支出を削除しても再登録はできません。家計で確認してください。',
        )
      if (
        !current.exists() ||
        current.data()!.version !== expected.version ||
        existing.exists()
      )
        throw Object.assign(new Error(), { code: 'finance-conflict' })
      const data = cleanFinanceEntry(
        input,
        category.exists()
          ? [{ ...category.data(), id: input.categoryId } as FinanceCategory]
          : [],
      )
      const writeMonths = await prepareExpenseMonths(
        tx,
        db,
        hid,
        uid,
        expense.id,
        null,
        data,
      )
      writeMonths()
      const audit = {
        createdAt: serverTimestamp(),
        createdBy: uid,
        updatedAt: serverTimestamp(),
        updatedBy: uid,
      }
      tx.set(expense, {
        ...data,
        shoppingItemId: expected.id,
        version: 1,
        ...audit,
      })
      tx.set(link, {
        expenseId: expense.id,
        createdAt: serverTimestamp(),
        createdBy: uid,
      })
      tx.update(item, {
        purchased: true,
        expenseId: expense.id,
        version: expected.version + 1,
        updatedAt: serverTimestamp(),
        updatedBy: uid,
      })
    })
  } catch (error) {
    const code =
      error && typeof error === 'object' && 'code' in error ? error.code : ''
    if (code === 'permission-denied' || code === 'aborted') {
      // Firestore may reject a racing commit before surfacing its version conflict.
      // Only reclassify if the caller can still read fresh household documents.
      const fresh = await Promise.all([
        getDocFromServer(item),
        getDocFromServer(link),
      ]).catch(() => null)
      if (fresh) {
        if (fresh[1].exists() || fresh[0].data()?.expenseId)
          throw new Error(
            'この買い物は支出に登録済みです。支出を削除しても再登録はできません。家計で確認してください。',
            { cause: error },
          )
        if (!fresh[0].exists() || fresh[0].data()!.version !== expected.version)
          throw Object.assign(new Error('', { cause: error }), {
            code: 'finance-conflict',
          })
      }
    }
    throw error
  }
}
