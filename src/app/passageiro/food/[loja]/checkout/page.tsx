import { CheckoutView } from "@/frontend/components/food/Checkout";

export default async function Page({ params }: { params: Promise<{ loja: string }> }) { return <CheckoutView storeId={(await params).loja} />; }
