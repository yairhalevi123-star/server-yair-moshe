-- Hospital Bag Items Table Migration
CREATE TABLE IF NOT EXISTS hospital_bag_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    text VARCHAR(255) NOT NULL,
    category VARCHAR(50) NOT NULL,
    checked BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_hospital_bag_user_id ON hospital_bag_items(user_id);
CREATE INDEX IF NOT EXISTS idx_hospital_bag_category ON hospital_bag_items(category);

-- Default items seed (will be inserted via application code during first GET request)
