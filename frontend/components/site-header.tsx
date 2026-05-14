"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Menu } from "lucide-react";

const itensNav = [
  { titulo: "Tarefas", href: "/tarefas" },
  { titulo: "Detetar imagem", href: "/detetar" },
];

function ehAtivo(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SiteHeader() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-14 w-full max-w-7xl items-center gap-3 px-4 md:px-6 lg:px-8">
        <Link
          href="/"
          className="text-sm font-semibold tracking-tight text-foreground"
        >
          VF-TABELAS
        </Link>

        <Separator orientation="vertical" className="mx-1 h-5" />

        {/* Navegação horizontal (md+) */}
        <nav className="hidden items-center gap-1 md:flex">
          {itensNav.map((item) => {
            const ativo = ehAtivo(pathname, item.href);
            return (
              <Button
                key={item.href}
                asChild
                size="sm"
                variant="ghost"
                className={cn(
                  "h-8 px-3 text-sm font-medium text-muted-foreground hover:text-foreground",
                  ativo && "bg-accent text-foreground",
                )}
              >
                <Link href={item.href}>{item.titulo}</Link>
              </Button>
            );
          })}
        </nav>

        {/* Navegação compacta (mobile) */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              className="size-8 md:hidden"
              aria-label="Abrir navegação"
            >
              <Menu className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-48">
            {itensNav.map((item) => (
              <DropdownMenuItem key={item.href} asChild>
                <Link href={item.href}>{item.titulo}</Link>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
