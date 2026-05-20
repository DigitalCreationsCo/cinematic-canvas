import { useTranslation } from "react-i18next";
import ForwardedIconComponent from "@/components/common/genericIconComponent";
import {
  useGetProducts,
  useGetSubscription,
  usePostCreateCheckout,
  usePostCreatePortal,
} from "@/controllers/API/queries/subscription";
import useAlertStore from "@/stores/alertStore";

const TIER_ICONS: Record<string, string> = {
  free: "Gift",
  pro: "Zap",
  enterprise: "Building2",
};

const TIER_COLORS: Record<string, string> = {
  free: "bg-muted text-muted-foreground",
  pro: "bg-amber-100 text-amber-700 border-amber-200",
  enterprise: "bg-purple-100 text-purple-700 border-purple-200",
};

const CHECKOUT_BUTTON_COLORS: Record<string, string> = {
  free: "",
  pro: "bg-amber-600 hover:bg-amber-700 text-white",
  enterprise: "bg-purple-600 hover:bg-purple-700 text-white",
};

const BillingPage = () => {
  const { t } = useTranslation();
  const setSuccessData = useAlertStore((state) => state.setSuccessData);
  const setErrorData = useAlertStore((state) => state.setErrorData);

  const { data: subscription, isLoading: subLoading } = useGetSubscription();
  const { data: products, isLoading: productsLoading } = useGetProducts();
  const { mutate: createCheckout, isPending: checkoutLoading } =
    usePostCreateCheckout();
  const { mutate: createPortal, isPending: portalLoading } =
    usePostCreatePortal();

  const handleUpgrade = (tierId: string) => {
    createCheckout(
      { tier: tierId },
      {
        onSuccess: (data) => {
          window.location.href = data.url;
        },
        onError: (error) => {
          setErrorData({
            title: "Checkout Error",
            list: [
              error?.response?.data?.detail ||
                "Failed to create checkout session",
            ],
          });
        },
      },
    );
  };

  const handleManageBilling = () => {
    createPortal(undefined, {
      onSuccess: (data) => {
        window.location.href = data.url;
      },
      onError: (error) => {
        setErrorData({
          title: "Portal Error",
          list: [
            error?.response?.data?.detail || "Failed to open billing portal",
          ],
        });
      },
    });
  };

  const currentTier = subscription?.tier || "free";

  if (subLoading || productsLoading) {
    return (
      <div className="flex h-full w-full items-center justify-center py-12">
        <ForwardedIconComponent
          name="Loader2"
          className="h-6 w-6 animate-spin text-muted-foreground"
        />
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col gap-6">
      <div className="flex w-full items-start gap-6">
        <div className="flex w-full flex-col">
          <h2
            className="flex items-center text-lg font-semibold tracking-tight"
            data-testid="settings_menu_header"
          >
            Billing & Subscription
            <ForwardedIconComponent
              name="CreditCard"
              className="ml-2 h-5 w-5 text-primary"
            />
          </h2>
          <p className="text-sm text-muted-foreground">
            Manage your subscription plan and billing information.
          </p>
        </div>
      </div>

      {subscription && subscription.tier !== "free" && (
        <div className="rounded-lg border bg-card p-4 text-card-foreground shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Current Plan</p>
              <p className="mt-1 text-lg font-bold capitalize">
                {subscription.tier}
              </p>
              {subscription.current_period_end && (
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {subscription.cancel_at_period_end
                    ? `Cancels on ${new Date(subscription.current_period_end).toLocaleDateString()}`
                    : `Renews on ${new Date(subscription.current_period_end).toLocaleDateString()}`}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${
                  subscription.status === "active"
                    ? "bg-green-100 text-green-700"
                    : subscription.status === "past_due"
                      ? "bg-red-100 text-red-700"
                      : "bg-muted text-muted-foreground"
                }`}
              >
                {subscription.status}
              </span>
              <button
                onClick={handleManageBilling}
                disabled={portalLoading}
                className="inline-flex items-center justify-center rounded-md border bg-background px-3 py-1.5 text-sm font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
              >
                {portalLoading ? "Loading..." : "Manage Billing"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-3">
        {products?.map((product) => {
          const isCurrentPlan = product.id === currentTier;
          const isFree = product.id === "free";

          return (
            <div
              key={product.id}
              className={`relative flex flex-col rounded-lg border bg-card text-card-foreground shadow-sm ${
                isCurrentPlan && !isFree ? "ring-2 ring-primary" : ""
              }`}
            >
              {isCurrentPlan && !isFree && (
                <div className="absolute -top-2.5 left-1/2 -translate-x-1/2">
                  <span className="inline-flex items-center rounded-full bg-primary px-3 py-0.5 text-xs font-medium text-primary-foreground shadow-sm">
                    Current Plan
                  </span>
                </div>
              )}
              <div className="flex flex-col gap-4 p-6">
                <div className="flex items-center gap-3">
                  <div
                    className={`inline-flex items-center justify-center rounded-lg p-2 ${
                      TIER_COLORS[product.id] || "bg-muted"
                    }`}
                  >
                    <ForwardedIconComponent
                      name={TIER_ICONS[product.id] || "Circle"}
                      className="h-5 w-5"
                    />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold">{product.name}</h3>
                  </div>
                </div>
                <div className="flex items-baseline gap-1">
                  {product.price ? (
                    <>
                      <span className="text-3xl font-bold">
                        ${(product.price / 100).toFixed(0)}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        /month
                      </span>
                    </>
                  ) : (
                    <span className="text-3xl font-bold">Free</span>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  {product.description}
                </p>
                <ul className="flex flex-col gap-2">
                  {product.features.map((feature, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <ForwardedIconComponent
                        name="Check"
                        className="mt-0.5 h-4 w-4 shrink-0 text-green-600"
                      />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="mt-auto p-6 pt-0">
                {isFree ? (
                  <div className="rounded-md border px-4 py-2 text-center text-sm text-muted-foreground">
                    Current Plan
                  </div>
                ) : isCurrentPlan ? (
                  <button
                    onClick={handleManageBilling}
                    disabled={portalLoading}
                    className={`inline-flex w-full items-center justify-center rounded-md px-4 py-2 text-sm font-medium shadow-sm transition-colors ${
                      CHECKOUT_BUTTON_COLORS[product.id]
                    } disabled:opacity-50`}
                  >
                    {portalLoading ? "Loading..." : "Manage"}
                  </button>
                ) : (
                  <button
                    onClick={() => handleUpgrade(product.id)}
                    disabled={checkoutLoading}
                    className={`inline-flex w-full items-center justify-center rounded-md px-4 py-2 text-sm font-medium shadow-sm transition-colors ${
                      CHECKOUT_BUTTON_COLORS[product.id]
                    } disabled:opacity-50`}
                  >
                    {checkoutLoading ? "Loading..." : "Upgrade"}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default BillingPage;
