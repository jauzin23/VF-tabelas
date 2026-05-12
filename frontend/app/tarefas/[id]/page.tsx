import { TaskDetail } from "@/components/task-detail"

export default async function PaginaDetalheTarefa({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return <TaskDetail id={id} />
}
