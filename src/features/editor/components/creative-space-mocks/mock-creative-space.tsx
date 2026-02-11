interface MockCreativeSpaceProps {
  name: string;
}

export function MockCreativeSpace({ name }: MockCreativeSpaceProps) {
  return (
    <div className="flex h-full items-center justify-center bg-muted/20">
      <div className="text-center">
        <div className="text-4xl">🚧</div>
        <h2 className="mt-2 text-xl font-semibold capitalize">{name}</h2>
        <p className="mt-1 text-sm text-muted-foreground">Coming soon</p>
      </div>
    </div>
  );
}
