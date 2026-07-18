/// <reference types="vite/client" />

import type { EmpiBridge } from './types/bridge'

declare global {
  interface Window {
    empi: EmpiBridge
  }
}

export {}
