import { nanoid } from 'nanoid'

export interface Partition {
  id: string
  name: string
}

export interface Service {
  id: string
  partitionId: string
  name: string
  url: string
  enabled: boolean
  hidden: boolean
  sortOrder?: number
}

export async function getPartitions(): Promise<Partition[]> {
  const savedData = localStorage.getItem('partitions')

  if (savedData) {
    return JSON.parse(savedData)
  }

  return []
}

export async function createPartition(name: string): Promise<void> {
  const partitions = await getPartitions()
  const newPartition = { id: nanoid(), name }
  partitions.push(newPartition)
  localStorage.setItem('partitions', JSON.stringify(partitions))
}

export async function updatePartition(id: string, name: string): Promise<void> {
  const partitions = await getPartitions()
  const partition = partitions.find((partition) => partition.id === id)

  if (partition) {
    partition.name = name
    localStorage.setItem('partitions', JSON.stringify(partitions))
  }
}

export async function deletePartition(id: string): Promise<void> {
  const partitions = await getPartitions()
  const newPartitions = partitions.filter((partition) => partition.id !== id)
  localStorage.setItem('partitions', JSON.stringify(newPartitions))
}

export async function getServices(): Promise<Service[]> {
  const savedData = localStorage.getItem(`services`)

  if (savedData) {
    const services: Service[] = JSON.parse(savedData).map(
      (service: Service & { hidden?: boolean; enabled?: boolean }) => ({
        ...service,
        enabled: service.enabled ?? true,
        hidden: service.hidden ?? false
      })
    )

    return services.sort((a: Service, b: Service) => {
      if (a.sortOrder && b.sortOrder) {
        return a.sortOrder - b.sortOrder
      }

      return 0
    })
  }

  return []
}

export async function createService(
  partitionId: string,
  name: string,
  url: string,
  enabled: boolean,
  hidden: boolean
): Promise<void> {
  const services = await getServices()
  const newService = { id: nanoid(), partitionId, name, url, enabled, hidden }
  services.push(newService)
  localStorage.setItem(`services`, JSON.stringify(services))
}

export async function updateService(
  id: string,
  partitionId: string,
  name: string,
  url: string,
  enabled: boolean,
  hidden: boolean
): Promise<void> {
  const services = await getServices()
  const service = services.find((service) => service.id === id)

  if (service) {
    service.partitionId = partitionId
    service.name = name
    service.url = url
    service.enabled = enabled
    service.hidden = hidden
    localStorage.setItem(`services`, JSON.stringify(services))
  }
}

export async function updateServicesSortOrder(
  services: { serviceId: string; sortOrder: number }[]
) {
  const servicesData = await getServices()
  const newServices = servicesData.map((service) => {
    const serviceOrder = services.find((s) => s.serviceId === service.id)
    if (serviceOrder) {
      service.sortOrder = serviceOrder.sortOrder
    }
    return service
  })

  localStorage.setItem(`services`, JSON.stringify(newServices))
}

export async function deleteService(id: string): Promise<void> {
  const services = await getServices()
  const newServices = services.filter((service) => service.id !== id)
  localStorage.setItem(`services`, JSON.stringify(newServices))
}

export async function getActiveServiceId(): Promise<string | null> {
  const savedData = localStorage.getItem('activeServiceId')

  if (savedData) {
    return savedData
  }

  return null
}

export async function saveActiveServiceId(serviceId: string | undefined): Promise<void> {
  if (serviceId) {
    localStorage.setItem('activeServiceId', serviceId)
  } else {
    localStorage.removeItem('activeServiceId')
  }
}

export async function getSidebarVisible(): Promise<boolean> {
  const savedData = localStorage.getItem('sidebarVisible')

  if (savedData !== null) {
    return savedData === 'true'
  }

  return true
}

export async function saveSidebarVisible(visible: boolean): Promise<void> {
  localStorage.setItem('sidebarVisible', visible.toString())
}
