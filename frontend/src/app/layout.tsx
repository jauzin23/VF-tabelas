import type { ReactNode } from "react";

export const metadata = {
  title: "Detetor de Tabelas",
  description: "Detetar imagens (ex.: prints de tabelas) em websites",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          fontFamily: "Inter, Arial, sans-serif",
          background: "#f8fafc",
          color: "#0f172a",
        }}
      >
        {children}
      </body>
    </html>
  );
}
