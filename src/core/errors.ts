export type ExitCode = 2 | 3 | 4 | 5 | 6

export class SpandekError extends Error {
  constructor(
    readonly code: ExitCode,
    readonly phase: string,
    readonly key: string | undefined,
    message: string,
  ) {
    super(message)
    this.name = new.target.name
  }
}

export class ConfigError extends SpandekError {
  constructor(key: string, message: string) {
    super(2, "config", key, message)
  }
}

export class InfeasibleError extends SpandekError {
  constructor(message: string) {
    super(3, "design", undefined, message)
  }
}

export class PhysicsRangeError extends SpandekError {
  constructor(key: string, message: string) {
    super(4, "model", key, message)
  }
}

export class DataError extends SpandekError {
  constructor(key: string, message: string) {
    super(5, "data", key, message)
  }
}

export class ResourceError extends SpandekError {
  constructor(message: string) {
    super(6, "resource", undefined, message)
  }
}
