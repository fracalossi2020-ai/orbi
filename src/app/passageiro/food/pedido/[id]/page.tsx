import { TrackingView } from "@/frontend/components/food/Tracking";

export default async function Page({ params }: { params: Promise<{ id: string }> }) { return <TrackingView orderId={(await params).id} />; }
