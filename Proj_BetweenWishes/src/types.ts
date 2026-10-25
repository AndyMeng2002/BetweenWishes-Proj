export type UUID = string;

export interface Profile {
  id: UUID;
  username: string;
  nickname: string;
  avatar_url: string | null;
  bio: string;
  birthday: string | null;
  search_enabled: boolean;
  wishlist_paused: boolean;
  gift_reminder_days: number;
  created_at: string;
}

export interface PartnerPreview {
  id: UUID;
  username: string;
  nickname: string;
  wishlist_paused: boolean;
}

export interface Wish {
  id: UUID;
  owner_id: UUID;
  title: string;
  image_urls: string[];
  product_url: string | null;
  price: number | null;
  quantity: number;
  specs: string | null;
  category: string;
  priority: "high" | "medium" | "low";
  budget_note: string | null;
  note: string | null;
  deadline: string | null;
  position: number;
  archived: boolean;
  created_at: string;
}

export interface Couple {
  id: UUID;
  member_a: UUID;
  member_b: UUID;
  created_at: string;
  ended_at: string | null;
}

export interface PartnerInvitation {
  id: UUID;
  direction: "sent" | "received";
  other_username: string;
  other_nickname: string;
  status: "pending" | "accepted" | "rejected" | "expired";
  created_at: string;
  expires_at: string;
}

export interface Gift {
  id: UUID;
  wish_id: UUID | null;
  giver_id: UUID;
  receiver_id: UUID;
  status: "drawn" | "purchased" | "sent" | "cancelled";
  wish_snapshot: Wish;
  drawn_at: string;
  purchased_at: string | null;
  sent_at: string | null;
  purchase_note: string | null;
}

export interface Notice {
  id: UUID;
  user_id: UUID;
  kind: string;
  title: string;
  content: string;
  read_at: string | null;
  created_at: string;
}

export interface DrawResult {
  giftRecordId: UUID;
  wish: Wish;
}
