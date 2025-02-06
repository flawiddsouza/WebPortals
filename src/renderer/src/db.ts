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
    return JSON.parse(savedData)
  }

  return []
}

export async function createService(
  partitionId: string,
  name: string,
  url: string,
  enabled: boolean
): Promise<void> {
  const services = await getServices()
  const newService = { id: nanoid(), partitionId, name, url, enabled }
  services.push(newService)
  localStorage.setItem(`services`, JSON.stringify(services))
}

export async function updateService(
  id: string,
  partitionId: string,
  name: string,
  url: string,
  enabled: boolean
): Promise<void> {
  const services = await getServices()
  const service = services.find((service) => service.id === id)

  if (service) {
    service.partitionId = partitionId
    service.name = name
    service.url = url
    service.enabled = enabled
    localStorage.setItem(`services`, JSON.stringify(services))
  }
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
