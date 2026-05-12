import { ImageDetector } from "@/components/image-detector"

export default function PaginaDetetar() {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
          Detetar tabelas em imagem
        </h1>
        <p className="text-balance text-muted-foreground">
          Carrega uma imagem para deteção direta usando o modelo de aprendizagem
          automática do backend.
        </p>
      </div>
      <ImageDetector />
    </div>
  )
}
