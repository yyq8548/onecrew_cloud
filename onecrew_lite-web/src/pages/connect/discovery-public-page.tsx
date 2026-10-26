import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { PublicPageReceipt } from "./discovery-review-material";
export { PublicPageReceipt } from "./discovery-review-material";
import {
  discoveryPublicPageKey, getDiscoveryPublicPage, publicPageRefreshInterval,
} from "@/lib/opencli-discovery";

type Props = { campaignId: string; candidateId: string; requestedUrl: string };

export function SavedPublicPageEvidence(props: Props) {
  // A different Campaign/candidate/URL starts closed, with no prior receipt.
  return <PublicPageEvidence key={JSON.stringify(discoveryPublicPageKey(props.campaignId, props.candidateId, props.requestedUrl))} {...props} />;
}

function PublicPageEvidence({ campaignId, candidateId, requestedUrl }: Props) {
  const { t } = useTranslation("shell");
  const [opened, setOpened] = useState(false);
  const query = useQuery({
    queryKey: discoveryPublicPageKey(campaignId, candidateId, requestedUrl),
    queryFn: () => getDiscoveryPublicPage(campaignId, candidateId, requestedUrl),
    enabled: opened, retry: false, refetchOnWindowFocus: true,
    refetchInterval: state => publicPageRefreshInterval(state.state.data?.status, state.state.dataUpdateCount, state.state.status === "error"),
  });
  return <div className="mt-2 space-y-2">
    <Button size="sm" variant="outline" disabled={query.isFetching} onClick={() => {
      if (opened) void query.refetch(); else setOpened(true);
    }}>{t("opencliPilot.savedPublicPage")}</Button>
    {opened && query.isFetching && <p role="status">{t("opencliPilot.publicPageLoading")}</p>}
    {opened && query.isError && <p role="status">{t("opencliPilot.publicPageUnavailable")}</p>}
    {opened && !query.isError && query.data && <PublicPageReceipt read={query.data} />}
  </div>;
}
