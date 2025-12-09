export type Connection = {
    protocol: string
    address: string
    port: number
    uri: string
    local: boolean
    relay: boolean
    IPv6: boolean
}

export type PlexServer = {
    name: string
    product: string
    productVersion: string
    platform: string
    platformVersion: string
    device: string
    clientIdentifier: string
    provides: string
    ownerId: string | null
    sourceTitle: string | null
    publicAddress: string
    accessToken: string | null
    searchEnabled: boolean
    createdAt: string
    lastSeenAt: string
    owned: boolean
    home: boolean
    synced: boolean
    relay: boolean
    presence: boolean
    httpsRequired: boolean
    publicAddressMatches: boolean
    dnsRebindingProtection?: boolean
    natLoopbackSupported?: boolean
    connections: Connection[]
}