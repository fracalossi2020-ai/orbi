import { BagView } from "@/frontend/components/food/Checkout";

export default async function Page({ params }: { params: Promise<{ loja: string }> }) { return <BagView storeId={(await params).loja} />; }
