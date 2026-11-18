import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  PILOT_SESSION_COOKIE,
  listMyNotifications,
  type NotificationView,
} from "@/lib/experience-api";
import { MarkAllReadButton } from "./mark-all-read";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Notifications",
};

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function NotificationsPage() {
  const token = (await cookies()).get(PILOT_SESSION_COOKIE)?.value;
  if (!token) {
    redirect(`/sign-in?next=${encodeURIComponent("/notifications")}`);
  }

  let items: NotificationView[] = [];
  let loadError = "";
  try {
    items = await listMyNotifications(token, 50);
  } catch (error) {
    loadError = (error as Error).message;
  }
  const unread = items.filter((item) => !item.read_at).length;

  return (
    <section className="notifications-page">
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <Link href="/account">Account</Link>
        <span aria-hidden="true">/</span>
        <span>Notifications</span>
      </nav>
      <div className="section-heading">
        <div>
          <span className="eyebrow">Your inbox</span>
          <h1>Notifications</h1>
          <p className="muted">
            {unread > 0
              ? `${unread} unread of ${items.length} notifications.`
              : `${items.length} notifications, all read.`}
          </p>
        </div>
        <MarkAllReadButton disabled={unread === 0} />
      </div>

      {loadError ? (
        <div className="notice err" role="alert">
          Notifications could not be loaded. {loadError}
        </div>
      ) : items.length === 0 ? (
        <div className="empty-panel">
          <h2>No notifications yet</h2>
          <p className="muted">Order and delivery updates will appear here.</p>
          <Link className="button" href="/orders">
            View my orders
          </Link>
        </div>
      ) : (
        <div className="notification-list">
          {items.map((item) => {
            const webLink =
              item.deep_link && item.deep_link.startsWith("/") ? item.deep_link : null;
            const content = (
              <>
                <span className={item.read_at ? "notification-dot read" : "notification-dot"} />
                <div className="notification-body">
                  <div className="notification-head">
                    <strong>{item.title}</strong>
                    <span className="muted">{formatDate(item.created_at)}</span>
                  </div>
                  <p>{item.body}</p>
                  {webLink ? <span className="card-link">Open →</span> : null}
                </div>
              </>
            );
            return webLink ? (
              <Link className="notification-item" href={webLink} key={item.id}>
                {content}
              </Link>
            ) : (
              <article className="notification-item" key={item.id}>
                {content}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
