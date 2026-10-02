import { useEffect, useState } from 'react'
import type { GraphicsSetting } from '../../domain/types'

/** A 3D nézet minősége: az eszköz erejéhez igazítva */
export type Quality = 'low' | 'medium' | 'high'

export interface QualityProfile {
  /** HDR égbolt a háttérhez, a fényekhez és a tükröződésekhez */
  hdri: boolean
  /** Árnyéktérkép mérete (0 = nincs árnyék) */
  shadows: 0 | 1024 | 2048
  /** Normáltérképek (a felületek domborzata) */
  normalMaps: boolean
  /** Utcabútorok (lámpák, fák) sűrűsége: ennyi méterenként egy */
  furnitureSpacing: number
  dpr: [number, number]
}

export const PROFILES: Record<Quality, QualityProfile> = {
  low: { hdri: false, shadows: 0, normalMaps: false, furnitureSpacing: 30, dpr: [1, 1.5] },
  medium: { hdri: true, shadows: 1024, normalMaps: true, furnitureSpacing: 18, dpr: [1, 2] },
  high: { hdri: true, shadows: 2048, normalMaps: true, furnitureSpacing: 14, dpr: [1, 2] },
}

export interface DeviceInfo {
  deviceMemory?: number
  hardwareConcurrency?: number
  userAgent?: string
  maxTouchPoints?: number
}

/**
 * „Automatikus”: gyenge eszközön (legfeljebb 4 GB memória, vagy telefon legfeljebb 4 maggal) alacsony,
 * egyéb telefonon közepes, asztali gépen magas minőség.
 */
export function resolveQuality(setting: GraphicsSetting, device: DeviceInfo): Quality {
  if (setting !== 'auto') return setting
  const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(device.userAgent ?? '') || (device.maxTouchPoints ?? 0) > 1
  const cores = device.hardwareConcurrency ?? 4
  if ((device.deviceMemory !== undefined && device.deviceMemory <= 4) || (mobile && cores <= 4)) return 'low'
  return mobile ? 'medium' : 'high'
}

function deviceInfo(): DeviceInfo {
  if (typeof navigator === 'undefined') return {}
  const nav = navigator as Navigator & { deviceMemory?: number }
  return { deviceMemory: nav.deviceMemory, hardwareConcurrency: nav.hardwareConcurrency, userAgent: nav.userAgent, maxTouchPoints: nav.maxTouchPoints }
}

let setting: GraphicsSetting = 'auto'
const listeners = new Set<() => void>()

/** A beállítás változásakor (Beállítások oldal, betöltés) a nyitott 3D nézetek is frissülnek */
export function setGraphicsSetting(s: GraphicsSetting) {
  setting = s
  listeners.forEach((l) => l())
}

export function currentQuality(): Quality {
  return resolveQuality(setting, deviceInfo())
}

export function useQuality(): QualityProfile {
  const [q, setQ] = useState<Quality>(currentQuality)
  useEffect(() => {
    const l = () => setQ(currentQuality())
    listeners.add(l)
    return () => {
      listeners.delete(l)
    }
  }, [])
  return PROFILES[q]
}
