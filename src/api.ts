import { CONFIG } from './config'

function formBody(params: Record<string, string | number | undefined>) {
  const usp = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined) continue
    usp.set(k, String(v))
  }
  return usp
}

export type RequestRow = {
  request_id: string
  created_at: string
  kid_id: string
  amount: number
  description: string
  status: 'pending' | 'approved' | 'denied'
  reviewed_at?: string
  reviewed_by?: string
  review_note?: string
  source?: string
  nonce?: string
}

export async function apiSubmit(args: {
  token: string
  kid_id: string
  amount: number
  description: string
  source: 'pwa'
  nonce: string
}) {
  const res = await fetch(CONFIG.API_URL, {
    method: 'POST',
    body: formBody({
      action: 'submit',
      token: args.token,
      kid_id: args.kid_id,
      amount: args.amount,
      description: args.description,
      source: args.source,
      nonce: args.nonce,
    }),
  })
  return res.json()
}

export async function apiReview(args: {
  token: string
  request_id: string
  status: 'approved' | 'denied'
  review_note?: string
  reviewed_by?: string
}) {
  const res = await fetch(CONFIG.API_URL, {
    method: 'POST',
    body: formBody({
      action: 'review',
      token: args.token,
      request_id: args.request_id,
      status: args.status,
      review_note: args.review_note,
      reviewed_by: args.reviewed_by,
    }),
  })
  return res.json()
}

export async function apiSummary(args: { token: string; kid_id?: string; limit?: number }) {
  const res = await fetch(CONFIG.API_URL, {
    method: 'POST',
    body: formBody({
      action: 'summary',
      token: args.token,
      kid_id: args.kid_id,
      limit: args.limit ?? 80,
    }),
  })
  return res.json() as Promise<{
    ok: boolean
    scope: string
    balances: Record<string, number>
    recent: RequestRow[]
    _status: number
    error?: string
  }>
}
