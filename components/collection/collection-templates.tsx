"use client";

import { useConfig } from "@/contexts/config-context";
import { downloadRepoFile } from "@/lib/download-file";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { Download } from "lucide-react";

type Template = { label: string; path: string };

/** "Templates" menu on a collection: downloads the files listed in the schema's `templates`. */
export function CollectionTemplates({ name, templates }: { name: string; templates: Template[] }) {
  const { config } = useConfig();
  if (!config) throw new Error(`Configuration not found.`);

  const handleDownload = (template: Template) => {
    toast.promise(downloadRepoFile(config, template.path, { type: "template", name }), {
      loading: `Downloading ${template.label}`,
      success: `Downloaded ${template.label}`,
      error: (error: any) => error.message,
    });
  };

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" className="shrink-0">
          <Download className="size-4" />
          <span className="hidden sm:inline">Templates</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {templates.map((template) => (
          <DropdownMenuItem key={template.path} onSelect={() => handleDownload(template)}>
            {template.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
