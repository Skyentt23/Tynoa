type Handler<T> = (payload: T) => void
type AnyHandler = (payload: unknown) => void

/** Bus d'événements typé : les modules publient, l'interface écoute. */
export class EventBus<E extends object> {
  private readonly handlers = new Map<keyof E, Set<AnyHandler>>()

  constructor(
    private readonly onHandlerError: (err: unknown) => void = (err) => console.error(err)
  ) {}

  on<K extends keyof E>(name: K, handler: Handler<E[K]>): () => void {
    let set = this.handlers.get(name)
    if (!set) {
      set = new Set()
      this.handlers.set(name, set)
    }
    const entry = handler as AnyHandler
    set.add(entry)
    return () => {
      set.delete(entry)
    }
  }

  emit<K extends keyof E>(name: K, payload: E[K]): void {
    for (const handler of [...(this.handlers.get(name) ?? [])]) {
      try {
        handler(payload)
      } catch (err) {
        this.onHandlerError(err)
      }
    }
  }
}
