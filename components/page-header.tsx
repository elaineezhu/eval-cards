interface PageHeaderProps {
  title: string
  description?: string
  eyebrow?: string
  metaItems?: Array<{
    label: string
    value: string
  }>
  size?: "default" | "wide"
  children?: React.ReactNode
}

export function PageHeader({
  title,
  description,
  eyebrow,
  metaItems = [],
  size = "default",
  children,
}: PageHeaderProps) {
  const wrapperClass =
    size === "wide"
      ? "mx-auto w-full max-w-[92rem] px-4 py-6 sm:px-6 lg:px-8"
      : "container mx-auto px-4 py-6 sm:px-6"

  return (
    <div className="motion-academic-enter border-b border-border/60 bg-background">
      <div className={wrapperClass}>
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div className="space-y-3">
            {eyebrow && (
              <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-muted-foreground">
                {eyebrow}
              </div>
            )}
            <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              {title}
            </h2>
            {description && (
              <p className="max-w-3xl text-base text-muted-foreground">
                {description}
              </p>
            )}
          </div>

          {(children || metaItems.length > 0) && (
            <div className="flex flex-col gap-3 lg:items-end">
              {children && (
                <div className="flex items-center gap-2">
                  {children}
                </div>
              )}
              {metaItems.length > 0 && (
                <div className="flex flex-wrap gap-2 lg:justify-end">
                  {metaItems.map((item) => (
                    <div key={`${item.label}-${item.value}`} className="rounded-full border border-border/70 bg-muted/20 px-3 py-1.5">
                      <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                        {item.label}
                      </span>
                      <span className="ml-2 text-sm font-semibold text-foreground">{item.value}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
