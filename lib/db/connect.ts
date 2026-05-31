import mongoose from 'mongoose'

type MongooseCache = {
  conn: typeof mongoose | null
  promise: Promise<typeof mongoose> | null
}

declare global {
  // eslint-disable-next-line no-var
  var __mongooseCache: MongooseCache | undefined
}

const cache: MongooseCache =
  global.__mongooseCache ?? (global.__mongooseCache = { conn: null, promise: null })

export async function connectDB(): Promise<typeof mongoose> {
  if (cache.conn) return cache.conn

  if (!cache.promise) {
    const uri = process.env.MONGODB_URI
    if (!uri) {
      throw new Error(
        'connectDB: MONGODB_URI is not set. Add it to .env.local (see .env.local.example).',
      )
    }

    cache.promise = mongoose
      .connect(uri, {
        bufferCommands: false,
        maxPoolSize: 10,
      })
      .then((m) => m)
  }

  try {
    cache.conn = await cache.promise
  } catch (err) {
    cache.promise = null
    throw err
  }

  return cache.conn
}
