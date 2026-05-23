interface CategoryBadgeProps {
  readonly category: string
}

function CategoryBadge({ category }: CategoryBadgeProps) {
  return (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-canvas-soft-2 text-[10px] font-medium text-body capitalize">
      {category}
    </span>
  )
}

export { CategoryBadge }
export type { CategoryBadgeProps }
