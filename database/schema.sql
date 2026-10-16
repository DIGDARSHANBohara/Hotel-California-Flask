-- DATABASE-PLAN.md implementation. Run with a selected database; all tables use InnoDB.
-- Connections must use UTC; DATE values represent the hotel's Asia/Kathmandu calendar.
SET SESSION time_zone = '+00:00';
CREATE TABLE IF NOT EXISTS users (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  display_code VARCHAR(20) NOT NULL UNIQUE,
  full_name VARCHAR(100) NOT NULL,
  email VARCHAR(254) NOT NULL UNIQUE,
  phone VARCHAR(25) NOT NULL,
  password_hash VARCHAR(255) NULL,
  role VARCHAR(20) NOT NULL,
  status VARCHAR(10) NOT NULL DEFAULT 'active',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT user_role CHECK (role IN ('customer','receptionist','admin','manager')),
  CONSTRAINT user_status CHECK (status IN ('active','inactive')),
  INDEX users_role_status (role,status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS room_types (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(50) NOT NULL UNIQUE,
  base_price DECIMAL(10,2) NOT NULL,
  capacity SMALLINT NOT NULL,
  beds VARCHAR(60) NOT NULL,
  description TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT type_price CHECK (base_price > 0),
  CONSTRAINT type_capacity CHECK (capacity BETWEEN 1 AND 6),
  CONSTRAINT type_active CHECK (is_active IN (0,1))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS rooms (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  room_number VARCHAR(10) NOT NULL UNIQUE,
  room_type_id INT NOT NULL,
  name VARCHAR(100) NOT NULL,
  floor SMALLINT NOT NULL,
  image_path VARCHAR(255) NOT NULL,
  operational_status VARCHAR(20) NOT NULL DEFAULT 'ready',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT room_type_fk FOREIGN KEY (room_type_id) REFERENCES room_types(id) ON DELETE RESTRICT,
  CONSTRAINT room_floor CHECK (floor BETWEEN 0 AND 99),
  CONSTRAINT room_operation CHECK (operational_status IN ('ready','maintenance','inactive'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS amenities (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(60) NOT NULL UNIQUE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS room_amenities (
  room_id INT NOT NULL,
  amenity_id INT NOT NULL,
  PRIMARY KEY (room_id,amenity_id),
  CONSTRAINT amenity_room_fk FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE RESTRICT,
  CONSTRAINT room_amenity_fk FOREIGN KEY (amenity_id) REFERENCES amenities(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS reservations (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  reservation_code VARCHAR(20) NOT NULL UNIQUE,
  customer_id INT NOT NULL,
  room_id INT NOT NULL,
  check_in_date DATE NOT NULL,
  check_out_date DATE NOT NULL,
  guest_count SMALLINT NOT NULL,
  nightly_rate DECIMAL(10,2) NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'USD',
  status VARCHAR(20) NOT NULL,
  special_requests VARCHAR(500) NULL,
  checked_in_at DATETIME NULL,
  checked_out_at DATETIME NULL,
  cancelled_at DATETIME NULL,
  created_by INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT booking_customer_fk FOREIGN KEY (customer_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT booking_room_fk FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE RESTRICT,
  CONSTRAINT booking_creator_fk FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT booking_dates CHECK (check_out_date > check_in_date),
  CONSTRAINT booking_guests CHECK (guest_count BETWEEN 1 AND 6),
  CONSTRAINT booking_rate CHECK (nightly_rate > 0),
  CONSTRAINT booking_currency CHECK (currency='USD'),
  CONSTRAINT booking_status CHECK (status IN ('pending','confirmed','checked_in','completed','cancelled')),
  INDEX availability (room_id,status,check_in_date,check_out_date),
  INDEX customer_bookings (customer_id,created_at),
  INDEX arrivals (status,check_in_date),
  INDEX departures (status,check_out_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS payments (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  payment_code VARCHAR(20) NOT NULL UNIQUE,
  reservation_id INT NOT NULL UNIQUE,
  amount DECIMAL(10,2) NOT NULL,
  method VARCHAR(20) NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  paid_at DATETIME NULL,
  refunded_at DATETIME NULL,
  recorded_by INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT payment_booking_fk FOREIGN KEY (reservation_id) REFERENCES reservations(id) ON DELETE RESTRICT,
  CONSTRAINT payment_actor_fk FOREIGN KEY (recorded_by) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT payment_amount CHECK (amount > 0),
  CONSTRAINT payment_method CHECK (method IS NULL OR method IN ('card','digital_wallet','pay_at_hotel')),
  CONSTRAINT payment_status CHECK (status IN ('pending','paid','failed','refunded','voided')),
  INDEX payment_reporting (status,paid_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS activity_logs (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  actor_id INT NULL,
  action VARCHAR(50) NOT NULL,
  entity_type VARCHAR(30) NOT NULL,
  entity_id INT NOT NULL,
  details TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT activity_actor_fk FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE RESTRICT,
  INDEX activity_reporting (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
