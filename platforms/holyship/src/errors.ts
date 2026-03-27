export class HolyshipError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = new.target.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
export class NotFoundError extends HolyshipError {}
export class ConflictError extends HolyshipError {}
export class ValidationError extends HolyshipError {}
export class GateError extends HolyshipError {}
export class InternalError extends HolyshipError {}
