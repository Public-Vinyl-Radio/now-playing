import { notFound } from "next/navigation";
import { LogoStudio } from "@/components/LogoStudio";

export default function LogoStudioPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <LogoStudio />;
}
