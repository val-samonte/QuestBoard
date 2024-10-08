import { Keypair } from '@solana/web3.js'
import bs58 from 'bs58'
import { sign } from 'tweetnacl'

export const getAccessToken = (keypair: Keypair, message?: string) => {
  if (!message) {
    const nonce = Keypair.generate().publicKey.toBase58()
    const today = Date.now()
    message = `${today}_${nonce}`
  }
  const signature = sign.detached(Buffer.from(message), keypair.secretKey)

  return `${message}.${bs58.encode(signature)}`
}
