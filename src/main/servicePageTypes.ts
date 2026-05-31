import type { Rectangle } from 'electron'

export interface ManagedServicePage {
  id: string
  partitionId: string
  name: string
  url: string
  enabled: boolean
  hidden: boolean
}

export interface ServicePageFailure {
  title: string
  message: string
  raw: string
}

export type ServicePagePlacement = 'embedded' | 'popped-out'

export interface ServicePageState {
  serviceId: string
  placement: ServicePagePlacement
  loading: boolean
  failure: ServicePageFailure | null
  currentUrl: string
  title: string
}

export interface ServicePageBounds extends Rectangle {}
