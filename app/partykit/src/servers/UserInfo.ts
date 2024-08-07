import type * as Party from 'partykit/server'
import type { ServerCommon } from './ServerCommon'
import { commonHeaders } from '../commonHeaders'
import { sign } from 'tweetnacl'
import bs58 from 'bs58'

export default class UserInfo implements ServerCommon {
  name = 'userinfo'
  sessionAddress = ''
  notifAddress = '' // derived from session keypair into Curve25519
  signature = ''
  availableStart = '8.0.AM'
  availableEnd = '8.0.PM'

  constructor(readonly room: Party.Room) {}

  async onStart() {
    this.sessionAddress = (await this.room.storage.get('sessionAddress')) ?? ''
    this.notifAddress = (await this.room.storage.get('notifAddress')) ?? ''
    this.signature = (await this.room.storage.get('signature')) ?? ''
    this.availableStart =
      (await this.room.storage.get('availableStart')) ?? '8.0.AM'
    this.availableEnd =
      (await this.room.storage.get('availableEnd')) ?? '8.0.PM'
  }

  async onRequest(req: Party.Request) {
    if (req.method === 'GET') {
      if (!this.sessionAddress) {
        return new Response('User Not found', {
          status: 404,
          headers: commonHeaders,
        })
      }

      return new Response(
        JSON.stringify({
          sessionAddress: this.sessionAddress,
          notifAddress: this.notifAddress,
          signature: this.signature,
          availableStart: this.availableStart,
          availableEnd: this.availableEnd,
        }),
        {
          status: 200,
          headers: commonHeaders,
        }
      )
    } else if (req.method === 'POST') {
      const [, address] = this.room.id.split('_')

      const data: {
        sessionAddress: string
        notifAddress: string
        signature: string
        availableStart?: string
        availableEnd?: string
      } = await req.json()

      if (
        !address ||
        !data.sessionAddress ||
        !data.notifAddress ||
        !data.signature
      ) {
        return new Response('Missing required fields', {
          status: 400,
          headers: commonHeaders,
        })
      }

      const message = new TextEncoder().encode(
        `I agree with QuestBoard's terms and privacy policy. ${data.sessionAddress}.${data.notifAddress}`
      )
      const ownerPubkey = bs58.decode(address)
      const signature = bs58.decode(data.signature)

      if (!sign.detached.verify(message, signature, ownerPubkey)) {
        return new Response('Invalid signature', {
          status: 400,
          headers: commonHeaders,
        })
      }

      this.sessionAddress = data.sessionAddress
      this.notifAddress = data.notifAddress
      this.signature = data.signature
      this.availableStart = this.availableStart ?? data.availableStart
      this.availableEnd = this.availableEnd ?? data.availableEnd

      this.room.storage.put('sessionAddress', this.sessionAddress)
      this.room.storage.put('notifAddress', this.notifAddress)
      this.room.storage.put('signature', this.signature)
      this.room.storage.put('availableStart', this.availableStart)
      this.room.storage.put('availableEnd', this.availableEnd)

      return new Response(
        JSON.stringify({
          sessionAddress: this.sessionAddress,
          notifAddress: this.notifAddress,
          signature: this.signature,
          availableStart: this.availableStart,
          availableEnd: this.availableEnd,
        }),
        {
          status: 200,
          headers: commonHeaders,
        }
      )
    }

    return new Response('Access denied', {
      status: 403,
      headers: commonHeaders,
    })
  }

  async onConnect(conn: Party.Connection, ctx: Party.ConnectionContext) {
    conn.close()
  }

  async onMessage(
    message: string | ArrayBufferLike,
    sender: Party.Connection
  ) {}

  static async onBeforeRequest(
    req: Party.Request,
    lobby: Party.Lobby,
    ctx: Party.ExecutionContext
  ) {
    return req
  }
  static async onBeforeConnect(
    req: Party.Request,
    lobby: Party.Lobby,
    ctx: Party.ExecutionContext
  ) {
    return new Response('Access denied', { status: 403 })
  }
}
