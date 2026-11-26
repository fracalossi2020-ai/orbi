import { StoreView } from "@/frontend/components/food/StoreView";

export default async function Page({ params }: { params: Promise<{ loja: string }> }) { return <StoreView storeId={(await params).loja} />; }
