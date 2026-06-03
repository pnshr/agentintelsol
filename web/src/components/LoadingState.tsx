export function LoadingState({ label = "Loading" }: { label?: string }) {
  return <div className="notice">{label}...</div>;
}

export function ErrorState({ message }: { message: string }) {
  return <div className="notice error">{message}</div>;
}
