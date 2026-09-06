-- 0001 already applied and only has one real row right now, so this is cheap to add today and
-- messy to retrofit once more accounts exist. "Brettly" and "brettly" should be one username, not two.
create unique index profiles_username_lower_idx on profiles (lower(username));
