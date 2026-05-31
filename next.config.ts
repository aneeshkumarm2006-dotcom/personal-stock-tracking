import type { NextConfig } from 'next'
import path from 'path'

const nextConfig: NextConfig = {
  turbopack: {
    resolveAlias: {
      electron: './electron-stub.js',
    },
  },
  webpack(config) {
    config.resolve.alias = {
      ...config.resolve.alias,
      electron: path.resolve(__dirname, 'electron-stub.js'),
    }
    return config
  },
}

export default nextConfig
