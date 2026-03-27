"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toUserMessage } from "@/lib/errors";

interface BrandConfig {
  id: string;
  slug: string;
  brandName: string;
  productName: string;
  tagline: string;
  domain: string;
  appDomain: string;
  cookieDomain: string;
  companyLegal: string;
  priceLabel: string;
  defaultImage: string;
  emailSupport: string;
  emailPrivacy: string;
  emailLegal: string;
  fromEmail: string;
  homePath: string;
  storagePrefix: string;
}

interface BrandFormProps {
  initial: BrandConfig;
  onSave: (endpoint: string, data: unknown) => Promise<void>;
}

export function BrandForm({ initial, onSave }: BrandFormProps) {
  const [form, setForm] = useState<BrandConfig>(initial);
  const [saving, setSaving] = useState(false);

  function set(key: keyof BrandConfig, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      await onSave("updateBrand", form);
      toast.success("Brand settings saved.");
    } catch (err) {
      toast.error(toUserMessage(err, "Failed to save brand settings"));
    } finally {
      setSaving(false);
    }
  }

  const fields: Array<{ key: keyof BrandConfig; label: string; placeholder?: string }> = [
    { key: "brandName", label: "Brand Name", placeholder: "WOPR" },
    { key: "productName", label: "Product Name", placeholder: "WOPR Platform" },
    { key: "tagline", label: "Tagline", placeholder: "Your AI platform" },
    { key: "slug", label: "Slug", placeholder: "wopr" },
    { key: "domain", label: "Domain", placeholder: "wopr.bot" },
    { key: "appDomain", label: "App Domain", placeholder: "app.wopr.bot" },
    { key: "cookieDomain", label: "Cookie Domain", placeholder: ".wopr.bot" },
    { key: "companyLegal", label: "Company Legal Name", placeholder: "WOPR Inc." },
    { key: "priceLabel", label: "Price Label", placeholder: "credits" },
    { key: "defaultImage", label: "Default Image URL", placeholder: "/og-image.png" },
    { key: "emailSupport", label: "Support Email", placeholder: "support@wopr.bot" },
    { key: "emailPrivacy", label: "Privacy Email", placeholder: "privacy@wopr.bot" },
    { key: "emailLegal", label: "Legal Email", placeholder: "legal@wopr.bot" },
    { key: "fromEmail", label: "From Email", placeholder: "noreply@wopr.bot" },
    { key: "homePath", label: "Home Path", placeholder: "/dashboard" },
    { key: "storagePrefix", label: "Storage Prefix", placeholder: "wopr" },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Brand Configuration</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {fields.map(({ key, label, placeholder }) => (
            <div key={key} className="space-y-1.5">
              <Label htmlFor={`brand-${key}`}>{label}</Label>
              <Input
                id={`brand-${key}`}
                value={form[key]}
                onChange={(e) => set(key, e.target.value)}
                placeholder={placeholder}
              />
            </div>
          ))}
        </div>
        <div className="flex justify-end pt-2">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save Brand"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
