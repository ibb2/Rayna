/* eslint-disable prettier/prettier */
import Store from 'electron-store'
import { v4 as uuidv4 } from 'uuid'
import crypto from 'crypto'
import qs from 'qs'
import { safeStorage } from 'electron'
import { PlexServer } from '../types'

class Authentication {
  plexProduct = 'pMusic' //TODO: Change this to Rayna product name
  plexClientId = ''
  plexUserAccessToken = ''
  plexId = ''
  plexCode = ''
  privateKey: string | null = null
  publicKey: string | null = null
  selectedServer: PlexServer | null = null

  store = new Store()

  constructor() {
    this.setUserInformation()
  }

  private encrypt(text: string): string {
    if (safeStorage.isEncryptionAvailable()) {
      return safeStorage.encryptString(text).toString('base64')
    }
    return text
  }

  private decrypt(text: string): string {
    if (safeStorage.isEncryptionAvailable()) {
      try {
        return safeStorage.decryptString(Buffer.from(text, 'base64'))
      } catch {
        // Fallback for unencrypted data (migration path)
        return text
      }
    }
    return text
  }

  public generateClientIdentifier(): string {
    // Client Identifier is not sensitive, keeping as plain text
    // Generate a random string of any length to set as the Client Identifier, or return stored Client Identifier if it exists.
    let clientIdentifier = this.store.get('clientIdentifier') as string | undefined
    if (clientIdentifier) {
      this.plexClientId = clientIdentifier
      return clientIdentifier
    }
    clientIdentifier = uuidv4()
    this.store.set('clientIdentifier', clientIdentifier)
    this.plexClientId = clientIdentifier
    return clientIdentifier
  }

  public async generateKeyPair(): Promise<[string, string]> {
    // Generate Private and Public key with ED25519 algorithm for Plex JWT Authentication
    // Or return from store if it exists

    const storedPublicKey = this.store.get('publicKey') as string | undefined
    const storedPrivateKey = this.store.get('privateKey') as string | undefined

    if (storedPublicKey && storedPrivateKey) {
      this.privateKey = this.decrypt(storedPrivateKey)
      this.publicKey = this.decrypt(storedPublicKey)
      return [this.publicKey, this.privateKey]
    }

    return new Promise((resolve, reject) => {
      crypto.generateKeyPair(
        'ed25519',
        {
          modulusLength: 2048,
          publicKeyEncoding: {
            type: 'spki',
            format: 'pem'
          },
          privateKeyEncoding: {
            type: 'pkcs8',
            format: 'pem'
          }
        },
        (err, publicKey, privateKey) => {
          if (err) {
            console.error(err)
            reject(err)
            return
          }
          // Cast to string because PEM format returns strings
          const publicKeyStr = publicKey as unknown as string
          const privateKeyStr = privateKey as unknown as string

          this.store.set('publicKey', this.encrypt(publicKeyStr))
          this.store.set('privateKey', this.encrypt(privateKeyStr))
          this.publicKey = publicKeyStr
          this.privateKey = privateKeyStr
          resolve([publicKeyStr, privateKeyStr])
        }
      )
    })
  }

  public async generatePin() {
    const url = 'https://plex.tv/api/v2/pins?strong=true'
    const headers = {
      Accept: 'application/json',
      'X-Plex-Product': this.plexProduct,
      'X-Plex-Client-Identifier': this.plexClientId || this.generateClientIdentifier()
    }

    const response = await fetch(url, { headers, method: 'POST' })
    const data = await response.json()

    this.plexId = data.id
    this.plexCode = data.code
    this.store.set('plexId', this.plexId)

    return data
  }

  public async checkPin() {
    // Using the Forwarding method to authenticate

    const authAppUrl =
      'https://app.plex.tv/auth#?' +
      qs.stringify({
        clientID: this.plexClientId,
        code: this.plexCode,
        forwardUrl: 'https://app.plex.tv/desktop', // Redirect to Plex Desktop on success
        context: {
          device: {
            product: this.plexProduct
          }
        }
      })

    return {
      authUrl: authAppUrl,
      plexId: this.plexId,
      plexCode: this.plexCode
    }
  }

  public async checkPinStatus(id: string) {
    const url = `https://plex.tv/api/v2/pins/${id}`
    const headers = {
      Accept: 'application/json',
      'X-Plex-Product': this.plexProduct,
      'X-Plex-Client-Identifier': this.plexClientId || this.generateClientIdentifier()
    }

    const response = await fetch(url, { headers })
    const data = await response.json()

    console.log(data['authToken'])

    if (data['authToken']) {
      this.plexUserAccessToken = data['authToken']
      this.store.set('plexUserAccessToken', this.encrypt(this.plexUserAccessToken))
    }

    return data
  }

  public isUserSignedIn(): boolean {
    // Check if the user is signed in by checking if the authentication token exists

    const authenticationToken = this.store.get('plexUserAccessToken') as string | undefined

    if (authenticationToken) {
      return true
    }

    return false
  }

  public async getServers(): Promise<PlexServer[]> {
    const url =
      'https://clients.plex.tv/api/v2/resources?includeHttps=1&includeRelay=1&includeIPv6=1'
    const headers = {
      Accept: 'application/json',
      'X-Plex-Product': this.plexProduct,
      'X-Plex-Client-Identifier': this.plexClientId || this.generateClientIdentifier(),
      'X-Plex-Token': this.plexUserAccessToken
    }

    const response = await fetch(url, { headers })
    const data = (await response.json()) as PlexServer[]

    const servers: PlexServer[] = data.filter((s) => s.product == 'Plex Media Server')
    console.log(servers)
    return servers
  }

  public async selectServer(server: PlexServer) {
    this.selectedServer = server
    this.store.set('selectedServer', JSON.stringify(this.selectedServer))
    console.log('Selected server: ', server)
  }

  public isServerSelected(): boolean {
    const selectedServer = this.store.get('selectedServer') as string | undefined

    console.log('selected server: ', selectedServer)

    if (selectedServer !== undefined || selectedServer !== null) {
      return true
    }

    return false
  }

  public async getUserSelectedServer(): Promise<PlexServer> {
    const selectedServer = this.selectedServer

    if (selectedServer != null) {
      return selectedServer
    }

    throw new Error('No server selected')
  }

  public async getUserAccessToken(): Promise<string> {
    return this.plexUserAccessToken
  }

  private setUserInformation() {
    this.plexClientId = this.generateClientIdentifier()
    try {
      this.plexUserAccessToken = this.decrypt(this.store.get('plexUserAccessToken') as string)
      this.plexId = this.store.get('plexId') as string
      this.privateKey = this.decrypt(this.store.get('privateKey') as string)
      this.publicKey = this.decrypt(this.store.get('publicKey') as string)
      const selectedServer = this.store.get('selectedServer') as string | undefined
      this.selectedServer =
        selectedServer != undefined ? (JSON.parse(selectedServer) as PlexServer) : null
    } catch (e) {
      console.error('User not authenticated: ', e)
    }
  }
}

export default Authentication
