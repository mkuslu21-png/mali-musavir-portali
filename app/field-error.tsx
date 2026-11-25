export function errorAttributes(id: string, message?: string) {
  return { "aria-invalid": Boolean(message), "aria-describedby": message ? id : undefined };
}

export default function FieldError({ id, message }: { id: string; message?: string }) {
  return message ? <span id={id} className="field-error" role="alert">{message}</span> : null;
}
