import { useEffect, useMemo } from "react";
import { Outlet, useLocation, useNavigate, useParams } from "@/lib/router";
import { PropertiesPanel } from "./PropertiesPanel";
import { useCompany } from "../context/CompanyContext";
import { shouldSyncCompanySelectionFromRoute } from "../lib/company-selection";
import { NotFoundPage } from "../pages/NotFound";

export function Layout() {
  const {
    companies,
    loading: companiesLoading,
    selectedCompany,
    selectedCompanyId,
    selectionSource,
    setSelectedCompanyId,
  } = useCompany();
  const { companyPrefix } = useParams<{ companyPrefix: string }>();
  const navigate = useNavigate();
  const location = useLocation();

  const matchedCompany = useMemo(() => {
    if (!companyPrefix) return null;
    const requestedPrefix = companyPrefix.toUpperCase();
    return companies.find((company) => company.issuePrefix.toUpperCase() === requestedPrefix) ?? null;
  }, [companies, companyPrefix]);

  const hasUnknownCompanyPrefix =
    Boolean(companyPrefix) && !companiesLoading && companies.length > 0 && !matchedCompany;

  // Sync company selection from route + handle case-correction redirect + fallback
  useEffect(() => {
    if (!companyPrefix || companiesLoading || companies.length === 0) return;

    if (!matchedCompany) {
      const fallback =
        (selectedCompanyId ? companies.find((company) => company.id === selectedCompanyId) : null) ??
        companies[0] ??
        null;
      if (fallback && selectedCompanyId !== fallback.id) {
        setSelectedCompanyId(fallback.id, { source: "route_sync" });
      }
      return;
    }

    if (companyPrefix !== matchedCompany.issuePrefix) {
      const suffix = location.pathname.replace(/^\/[^/]+/, "");
      navigate(`/${matchedCompany.issuePrefix}${suffix}${location.search}`, { replace: true });
      return;
    }

    if (
      shouldSyncCompanySelectionFromRoute({
        selectionSource,
        selectedCompanyId,
        routeCompanyId: matchedCompany.id,
      })
    ) {
      setSelectedCompanyId(matchedCompany.id, { source: "route_sync" });
    }
  }, [
    companyPrefix,
    companies,
    companiesLoading,
    matchedCompany,
    location.pathname,
    location.search,
    navigate,
    selectionSource,
    selectedCompanyId,
    setSelectedCompanyId,
  ]);

  return (
    <div className="bg-background text-foreground min-h-dvh">
      <main id="main-content" tabIndex={-1} className="h-dvh overflow-auto p-4 md:p-6">
        {hasUnknownCompanyPrefix ? (
          <NotFoundPage
            scope="invalid_company_prefix"
            requestedPrefix={companyPrefix ?? selectedCompany?.issuePrefix}
          />
        ) : (
          <Outlet />
        )}
      </main>
      <PropertiesPanel />
    </div>
  );
}
