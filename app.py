"""Hotel California: HTML/JavaScript -> Flask -> MySQL.

Read from top to bottom: connection, reading records, booking rules, actions,
then the Flask routes near the bottom of this file.
"""

import json
import os
import re
import secrets
from contextlib import contextmanager
from datetime import date, datetime
from decimal import Decimal
from pathlib import Path
from zoneinfo import ZoneInfo

import pymysql
from flask import Flask, jsonify, redirect, request, send_from_directory, session
from urllib.parse import urlencode
from werkzeug.exceptions import HTTPException
from werkzeug.security import check_password_hash, generate_password_hash

ROOT = Path(__file__).resolve().parent
HOTEL_TIMEZONE = os.environ.get("HOTEL_TIMEZONE", "Asia/Kathmandu")
TABLES = ["users", "room_types", "rooms", "amenities", "room_amenities",
          "reservations", "payments", "activity_logs"]
ACTORS = {"customer": "C001", "receptionist": "S001", "admin": "S002", "manager": "S003"}
PUBLIC = {"loadRooms", "loadRoomTypes"}
CUSTOMER = PUBLIC | {"loadProfile", "loadReservations", "loadPayments",
                     "updateProfile", "createReservation", "cancelReservation", "payReservation"}
STAFF = PUBLIC | {"loadProfile", "loadReservations", "loadPayments", "loadCustomers",
                  "loadActivity", "updateReservation", "cancelReservation", "payReservation", "transitionStay"}
PERMISSIONS = {"public": PUBLIC, "customer": CUSTOMER, "receptionist": STAFF, "manager": STAFF,
               "admin": STAFF | {"loadStaff", "saveRoom", "deleteRoom", "saveRoomType",
                                 "deleteRoomType", "saveStaff", "deleteStaff"}}
LABELS = {"pending": "Pending", "confirmed": "Confirmed", "checked_in": "Checked In",
          "completed": "Completed", "cancelled": "Cancelled", "paid": "Paid",
          "failed": "Failed", "refunded": "Refunded", "voided": "Voided"}
METHODS = {"card": "Card", "digital_wallet": "Digital Wallet", "pay_at_hotel": "Pay at Hotel"}
app = Flask(__name__, static_folder=None)
app.config["MAX_CONTENT_LENGTH"] = 65536
app.config.update(SECRET_KEY=os.environ.get("FLASK_SECRET_KEY") or secrets.token_hex(32),
                  SESSION_COOKIE_HTTPONLY=True, SESSION_COOKIE_SAMESITE="Lax")


# 1. MYSQL CONNECTION: passwords stay in your existing private JSON file.
def database_config():
    explicit = os.environ.get("MYSQL_CONFIG")
    paths = [Path(explicit)] if explicit else [
        Path(os.environ.get("LOCALAPPDATA", str(Path.home() / "AppData/Local")))
        / "HotelCalifornia/mysql/hotel-client.json",
        Path.home() / "AppData/Local/HotelCalifornia/mysql/hotel-client.json",
    ]
    path = next((p for p in paths if p.is_file()), None)
    if path is None:
        raise ValueError("MySQL connection file is missing. Set MYSQL_CONFIG to a private hotel-client.json file.")
    config = json.loads(path.read_text(encoding="utf-8-sig"))
    if any(not isinstance(config.get(key), str) or not config[key]
           for key in ("host", "user", "password", "database")):
        raise ValueError("MySQL connection configuration is incomplete.")
    return {key: config[key] for key in ("host", "user", "password", "database")} | {
        "port": int(config.get("port", 3306))}


@contextmanager
def database():
    connection = pymysql.connect(**(app.config.get("MYSQL_CONNECTION") or database_config()),
                                 charset="utf8mb4", cursorclass=pymysql.cursors.DictCursor,
                                 autocommit=False, connect_timeout=5)
    try:
        query(connection, "SET SESSION time_zone = '+00:00'")
        query(connection, "SET SESSION TRANSACTION ISOLATION LEVEL READ COMMITTED")
        connection.begin()
        yield connection
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


def query(connection, sql, values=None):
    """%s placeholders keep user input separate from the SQL command."""
    with connection.cursor() as cursor:
        cursor.execute(sql, values)
        if not cursor.description:
            return {"id": cursor.lastrowid, "count": cursor.rowcount}
        rows = cursor.fetchall()
        for row in rows:
            for key, value in row.items():
                if isinstance(value, datetime):
                    row[key] = value.isoformat(sep=" ")
                elif isinstance(value, date):
                    row[key] = value.isoformat()
        return rows


def json_values(value):
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, dict):
        return {key: json_values(item) for key, item in value.items()}
    if isinstance(value, list):
        return [json_values(item) for item in value]
    return value


def today():
    return datetime.now(ZoneInfo(HOTEL_TIMEZONE)).date().isoformat()


# 2. READ RECORDS: return the field names already used by your frontend.
RESERVATIONS_SQL = """SELECT b.*, u.display_code AS customer_code, u.full_name AS guest,
    r.name AS room_name, r.room_number, t.name AS room_type,
    ROUND(DATEDIFF(b.check_out_date,b.check_in_date)*b.nightly_rate,2) AS total,
    p.status AS payment_status FROM reservations b
    JOIN users u ON u.id=b.customer_id JOIN rooms r ON r.id=b.room_id
    JOIN room_types t ON t.id=r.room_type_id LEFT JOIN payments p ON p.reservation_id=b.id"""


def reservation_view(row):
    return {"id": row["reservation_code"], "customerId": row["customer_code"],
            "guest": row["guest"], "roomId": row["room_id"], "roomName": row["room_name"],
            "roomNumber": row["room_number"], "roomType": row["room_type"],
            "checkIn": row["check_in_date"], "checkOut": row["check_out_date"],
            "guests": row["guest_count"], "nightlyRate": row["nightly_rate"],
            "currency": row["currency"], "total": row["total"], "status": LABELS[row["status"]],
            "paymentStatus": LABELS.get(row["payment_status"], "Pending"),
            "requests": row["special_requests"] or "", "checkedInAt": row["checked_in_at"],
            "checkedOutAt": row["checked_out_at"], "cancelledAt": row["cancelled_at"]}


def view_stay(connection, stay_id):
    return reservation_view(query(connection, RESERVATIONS_SQL + " WHERE b.id=%s", [stay_id])[0])


def load_users(connection, staff=False):
    operator = "<>" if staff else "="
    rows = query(connection, f"SELECT display_code AS id,full_name AS name,email,phone,role,status "
                            f"FROM users WHERE role {operator} 'customer' ORDER BY users.id")
    for row in rows:
        row["role"] = row["role"].capitalize()
        row["status"] = row["status"].capitalize()
    return rows


def load_types(connection):
    rows = query(connection, "SELECT id,name,base_price AS price,capacity,beds,description,"
                             "is_active AS isActive FROM room_types ORDER BY id")
    for row in rows:
        row["isActive"] = bool(row["isActive"])
    return rows


def load_rooms(connection, filters):
    rows = query(connection, """SELECT r.id,r.room_number AS number,r.floor,t.name AS type,r.name,
        r.operational_status AS operationalStatus,r.image_path AS image,t.base_price AS price,
        t.capacity,t.beds,t.description,t.is_active FROM rooms r
        JOIN room_types t ON t.id=r.room_type_id ORDER BY r.id""")
    amenities = query(connection, "SELECT ra.room_id,a.name FROM room_amenities ra "
                                 "JOIN amenities a ON a.id=ra.amenity_id ORDER BY ra.room_id,a.id")
    bookings = query(connection, "SELECT room_id,status,check_in_date,check_out_date FROM reservations "
                                "WHERE status IN ('pending','confirmed','checked_in')")
    arrival, departure = filters.get("checkIn"), filters.get("checkOut")
    if (arrival or departure) and (not valid_date(arrival) or not valid_date(departure) or departure <= arrival):
        raise ValueError("Choose valid arrival and departure dates.")
    result = []
    for room in rows:
        stays = [b for b in bookings if b["room_id"] == room["id"]]
        if room["operationalStatus"] == "maintenance":
            status = "Maintenance"
        elif room["operationalStatus"] == "inactive" or not room["is_active"]:
            status = "Inactive"
        elif arrival and departure:
            status = "Reserved" if any(b["check_in_date"] < departure and b["check_out_date"] > arrival for b in stays) else "Available"
        elif any(b["status"] == "checked_in" for b in stays):
            status = "Occupied"
        else:
            status = "Reserved" if any(b["check_in_date"] <= today() < b["check_out_date"] for b in stays) else "Available"
        room["status"] = status
        room["amenities"] = [a["name"] for a in amenities if a["room_id"] == room["id"]]
        del room["is_active"]
        if filters.get("type") and room["type"] != filters["type"]:
            continue
        if filters.get("guests") and room["capacity"] < float(filters["guests"]):
            continue
        if filters.get("price") and room["price"] > Decimal(str(filters["price"])):
            continue
        result.append(room)
    return result


def load_payments(connection, filters=None):
    rows = query(connection, """SELECT p.payment_code AS id,b.reservation_code AS reservationId,
        u.display_code AS customerId,u.full_name AS customer,p.amount,b.currency,p.method,p.status,
        DATE(COALESCE(p.paid_at,p.created_at)) AS date,p.paid_at AS paidAt,p.refunded_at AS refundedAt
        FROM payments p JOIN reservations b ON b.id=p.reservation_id
        JOIN users u ON u.id=b.customer_id ORDER BY p.id""")
    for row in rows:
        row["method"] = METHODS.get(row["method"], "Not selected")
        row["status"] = LABELS[row["status"]]
    customer = (filters or {}).get("customerId")
    return [row for row in rows if not customer or row["customerId"] == customer]


def read_records(connection, method, filters):
    if method == "loadRooms":
        return load_rooms(connection, filters)
    if method == "loadRoomTypes":
        return load_types(connection)
    if method == "loadProfile":
        rows = query(connection, "SELECT display_code AS id,full_name AS name,email,phone,role,status "
                     "FROM users WHERE display_code=%s", [filters["profileId"]])
        if not rows:
            raise ValueError("Profile not found.")
        rows[0]["role"] = rows[0]["role"].capitalize()
        rows[0]["status"] = rows[0]["status"].capitalize()
        return rows[0]
    if method in ("loadCustomers", "loadStaff"):
        users = load_users(connection, method == "loadStaff")
        return users
    if method == "loadPayments":
        return load_payments(connection, filters)
    if method == "loadActivity":
        rows = query(connection, "SELECT COALESCE(u.full_name,'System') AS actor,a.details AS message,"
                                 "a.created_at AS time,a.action FROM activity_logs a "
                                 "LEFT JOIN users u ON u.id=a.actor_id ORDER BY a.id")
        for row in rows:
            row["time"] += " UTC"
        return rows
    rows = [reservation_view(row) for row in query(connection, RESERVATIONS_SQL + " ORDER BY b.id")]
    return [r for r in rows if
            (not filters.get("customerId") or r["customerId"] == filters["customerId"]) and
            (not filters.get("status") or r["status"] == filters["status"]) and
            (not filters.get("type") or r["roomType"] == filters["type"]) and
            (not filters.get("date") or r["checkIn"] <= filters["date"] < r["checkOut"]) and
            (not filters.get("search") or str(filters["search"]).lower() in (r["id"] + " " + r["guest"]).lower())]


# 3. BOOKING RULES: real dates, capacity, room availability and no overlaps.
def required(value, label, maximum=100):
    if not isinstance(value, str) or not value.strip() or len(value.strip()) > maximum:
        raise ValueError(f"Enter a valid {label} (up to {maximum} characters).")
    return value.strip()


def choice(value, options, label):
    if value not in options:
        raise ValueError(f"Choose a valid {label}.")
    return value


def integer(value, minimum, maximum, label):
    try:
        number = float(value)
        if isinstance(value, bool) or not number.is_integer() or not minimum <= number <= maximum:
            raise ValueError()
        return int(number)
    except (TypeError, ValueError, OverflowError):
        raise ValueError(f"{label} must be between {minimum} and {maximum}.") from None


def valid_date(value):
    try:
        return isinstance(value, str) and re.fullmatch(r"\d{4}-\d{2}-\d{2}", value) is not None and date.fromisoformat(value).isoformat() == value
    except ValueError:
        return False


def email(value):
    value = required(value, "email", 254).lower()
    if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", value):
        raise ValueError("Enter a valid email address.")
    return value


def password(value):
    if not isinstance(value, str) or not 8 <= len(value) <= 128:
        raise ValueError("Use a password of 8–128 characters.")
    return value


def audit(connection, actor, action, entity, entity_id, details):
    query(connection, "INSERT INTO activity_logs(actor_id,action,entity_type,entity_id,details) "
                      "VALUES (%s,%s,%s,%s,%s)", [actor["id"], action, entity, entity_id, details])


def lock_room(connection, room_id):
    rows = query(connection, "SELECT * FROM rooms WHERE id=%s FOR UPDATE", [integer(room_id, 1, 2147483647, "Room ID")])
    if not rows:
        raise ValueError("Room not found.")
    room = rows[0]
    room["type"] = query(connection, "SELECT * FROM room_types WHERE id=%s FOR SHARE", [room["room_type_id"]])[0]
    return room


def lock_stay(connection, code, actor):
    locator = query(connection, "SELECT room_id FROM reservations WHERE reservation_code=%s", [str(code)])
    if not locator:
        raise ValueError("Reservation not found.")
    room = lock_room(connection, locator[0]["room_id"])
    stay = query(connection, "SELECT * FROM reservations WHERE reservation_code=%s FOR UPDATE", [str(code)])[0]
    if actor["role"] == "customer" and stay["customer_id"] != actor["id"]:
        raise ValueError("This reservation belongs to another customer.")
    payments = query(connection, "SELECT * FROM payments WHERE reservation_id=%s FOR UPDATE", [stay["id"]])
    if not payments:
        raise ValueError("Reservation payment summary is missing.")
    return room, stay, payments[0]


def validate_stay(connection, room, values, except_id=0):
    arrival, departure = values.get("checkIn"), values.get("checkOut")
    if not valid_date(arrival) or not valid_date(departure) or arrival < today():
        raise ValueError("Choose valid calendar dates beginning today or later.")
    nights = (date.fromisoformat(departure) - date.fromisoformat(arrival)).days
    if not 1 <= nights <= 90:
        raise ValueError("Choose a stay of 1–90 nights, with check-out after check-in.")
    integer(values.get("guests"), 1, room["type"]["capacity"], "Guests")
    if room["operational_status"] != "ready" or not room["type"]["is_active"]:
        raise ValueError("This room is unavailable for booking.")
    conflicts = query(connection, "SELECT id FROM reservations WHERE room_id=%s AND id<>%s "
                      "AND status IN ('pending','confirmed','checked_in') "
                      "AND check_in_date<%s AND check_out_date>%s LIMIT 1",
                      [room["id"], except_id, departure, arrival])
    if conflicts:
        raise ValueError("This room is unavailable for those dates.")
    return nights


# 4. ACTIONS: all related changes commit together, or all roll back.
def run_action(connection, actor, method, args):
    record_id = args[0] if args else None
    data = args[1] if len(args) > 1 else None
    if method == "updateProfile":
        values = record_id or {}
        query(connection, "UPDATE users SET full_name=%s,email=%s,phone=%s WHERE id=%s AND role='customer'",
              [required(values.get("name"), "name"), email(values.get("email")), required(values.get("phone"), "phone", 25), actor["id"]])
        audit(connection, actor, "profile_updated", "user", actor["id"], "Updated guest profile.")
        return next(u for u in load_users(connection) if u["id"] == actor["display_code"])

    if method == "createReservation":
        values = record_id or {}
        room = lock_room(connection, values.get("roomId"))
        validate_stay(connection, room, values)
        inserted = query(connection, """INSERT INTO reservations(reservation_code,customer_id,room_id,
            check_in_date,check_out_date,guest_count,nightly_rate,currency,status,special_requests,created_by)
            VALUES (%s,%s,%s,%s,%s,%s,%s,'USD','confirmed',%s,%s)""",
            ["TMP-" + secrets.token_hex(6), actor["id"], room["id"], values["checkIn"], values["checkOut"],
             int(values["guests"]), room["type"]["base_price"], str(values.get("requests") or "").strip()[:500] or None, actor["id"]])["id"]
        code = f"HC-{1000 + inserted}"
        query(connection, "UPDATE reservations SET reservation_code=%s WHERE id=%s", [code, inserted])
        payment_id = query(connection, """INSERT INTO payments(payment_code,reservation_id,amount,status)
            SELECT %s,id,ROUND(DATEDIFF(check_out_date,check_in_date)*nightly_rate,2),'pending'
            FROM reservations WHERE id=%s""", ["TMP-" + secrets.token_hex(6), inserted])["id"]
        query(connection, "UPDATE payments SET payment_code=%s WHERE id=%s", [f"PAY-{2000 + payment_id}", payment_id])
        audit(connection, actor, "reservation_created", "reservation", inserted, f"Created {code} with pending payment.")
        return view_stay(connection, inserted)

    if method in {"updateReservation", "cancelReservation", "payReservation", "transitionStay"}:
        room, stay, payment = lock_stay(connection, record_id, actor)
        if method == "updateReservation":
            if stay["status"] not in ("pending", "confirmed"):
                raise ValueError("Only pending or confirmed stays can be edited.")
            values = data or {}
            nights = validate_stay(connection, room, values, stay["id"])
            status = choice(values.get("status"), ["Pending", "Confirmed"], "reservation status").lower()
            total = nights * stay["nightly_rate"]
            previous = (date.fromisoformat(stay["check_out_date"]) - date.fromisoformat(stay["check_in_date"])).days * stay["nightly_rate"]
            if payment["status"] in ("paid", "refunded") and total != previous:
                raise ValueError("This stay is paid. Keep the same total.")
            query(connection, "UPDATE reservations SET check_in_date=%s,check_out_date=%s,guest_count=%s,status=%s WHERE id=%s",
                  [values["checkIn"], values["checkOut"], int(values["guests"]), status, stay["id"]])
            if payment["status"] not in ("paid", "refunded"):
                query(connection, "UPDATE payments SET amount=%s WHERE id=%s", [total, payment["id"]])
            audit(connection, actor, "reservation_updated", "reservation", stay["id"], f"Updated {record_id}: total {previous} to {total} USD; status {status}.")
            return view_stay(connection, stay["id"])
        if method == "cancelReservation":
            if stay["status"] not in ("pending", "confirmed"):
                raise ValueError("This reservation can no longer be cancelled.")
            query(connection, "UPDATE reservations SET status='cancelled',cancelled_at=UTC_TIMESTAMP() WHERE id=%s", [stay["id"]])
            status = "refunded" if payment["status"] == "paid" else "voided"
            timestamp = "UTC_TIMESTAMP()" if status == "refunded" else "NULL"
            query(connection, f"UPDATE payments SET status=%s,refunded_at={timestamp},recorded_by=%s WHERE id=%s", [status, actor["id"], payment["id"]])
            audit(connection, actor, "reservation_cancelled", "reservation", stay["id"], f"Cancelled {record_id}; payment {status}, {payment['amount']} USD.")
            return None
        if method == "payReservation":
            if stay["status"] in ("cancelled", "completed") or payment["status"] in ("refunded", "voided", "paid"):
                raise ValueError("This stay cannot accept another payment.")
            payment_method = choice(data, list(METHODS.values()), "payment method").lower().replace(" ", "_")
            collected = len(args) > 2 and args[2] is True
            if collected and actor["role"] == "customer":
                raise ValueError("Only staff can record collection at the hotel.")
            status = "pending" if payment_method == "pay_at_hotel" and not collected else "paid"
            timestamp = "UTC_TIMESTAMP()" if status == "paid" else "NULL"
            query(connection, f"UPDATE payments SET method=%s,status=%s,paid_at={timestamp},recorded_by=%s WHERE id=%s",
                  [payment_method, status, actor["id"], payment["id"]])
            audit(connection, actor, "payment_" + status, "payment", payment["id"], f"{record_id}: {status}, {payment['amount']} USD via {payment_method}.")
            return next(p for p in load_payments(connection) if p["id"] == payment["payment_code"])
        if data == "Checked In":
            if stay["status"] != "confirmed" or not stay["check_in_date"] <= today() < stay["check_out_date"]:
                raise ValueError("Only a confirmed stay within its dates can check in.")
            if room["operational_status"] != "ready" or not room["type"]["is_active"]:
                raise ValueError("This room is not ready for check-in.")
            if query(connection, "SELECT id FROM reservations WHERE room_id=%s AND id<>%s AND status='checked_in'", [room["id"], stay["id"]]):
                raise ValueError("This room is still occupied. Resolve the existing stay first.")
            query(connection, "UPDATE reservations SET status='checked_in',checked_in_at=UTC_TIMESTAMP() WHERE id=%s", [stay["id"]])
            audit(connection, actor, "checked_in", "reservation", stay["id"], f"Checked in {record_id}.")
        elif data == "Completed":
            if stay["status"] != "checked_in":
                raise ValueError("The guest must be checked in before checkout.")
            if payment["status"] != "paid":
                raise ValueError("Record a payment before checkout.")
            query(connection, "UPDATE reservations SET status='completed',checked_out_at=UTC_TIMESTAMP() WHERE id=%s", [stay["id"]])
            audit(connection, actor, "checked_out", "reservation", stay["id"], f"Checked out {record_id}; booked amount preserved.")
        else:
            raise ValueError("Invalid stay transition.")
        return None

    if method == "saveRoom":
        values = data or {}
        room = lock_room(connection, record_id) if record_id else None
        types = query(connection, "SELECT * FROM room_types WHERE name=%s FOR SHARE", [required(values.get("type"), "room type", 50)])
        if not types:
            raise ValueError("Choose an existing room type.")
        room_type = types[0]
        number = required(values.get("number"), "room number", 10)
        floor = integer(values.get("floor"), 0, 99, "Floor")
        status = choice(values.get("operationalStatus") or "ready", ["ready", "maintenance", "inactive"], "operational status")
        if room and (room["room_type_id"], room["room_number"], room["operational_status"]) != (room_type["id"], number, status):
            if query(connection, "SELECT id FROM reservations WHERE room_id=%s AND status IN ('pending','confirmed','checked_in') LIMIT 1", [room["id"]]):
                raise ValueError("Resolve active stays before changing room type, number, or operational status.")
        if room:
            room_id = room["id"]
            query(connection, "UPDATE rooms SET room_number=%s,room_type_id=%s,floor=%s,operational_status=%s WHERE id=%s", [number, room_type["id"], floor, status, room_id])
        else:
            image = "assets/images/rooms/villa.jpg" if room_type["name"] == "Private Villa" else "assets/images/rooms/deluxe.jpg"
            room_id = query(connection, "INSERT INTO rooms(room_number,room_type_id,name,floor,image_path,operational_status) VALUES (%s,%s,%s,%s,%s,%s)",
                            [number, room_type["id"], f"{room_type['name']} Room {number}", floor, image, status])["id"]
            for name in ("Wi-Fi", "Daily housekeeping"):
                query(connection, "INSERT INTO amenities(name) VALUES (%s) ON DUPLICATE KEY UPDATE name=VALUES(name)", [name])
                query(connection, "INSERT INTO room_amenities(room_id,amenity_id) SELECT %s,id FROM amenities WHERE name=%s", [room_id, name])
        audit(connection, actor, "room_saved", "room", room_id, f"Saved room {number}; operational status {status}.")
        return next(r for r in load_rooms(connection, {}) if r["id"] == room_id)
    if method == "deleteRoom":
        room = lock_room(connection, record_id)
        if query(connection, "SELECT id FROM reservations WHERE room_id=%s LIMIT 1", [room["id"]]):
            raise ValueError("This room has reservation history. Mark it inactive instead.")
        query(connection, "DELETE FROM room_amenities WHERE room_id=%s", [room["id"]])
        query(connection, "DELETE FROM rooms WHERE id=%s", [room["id"]])
        audit(connection, actor, "room_deleted", "room", room["id"], f"Deleted unreferenced room {room['room_number']}.")
        return None
    if method in ("saveRoomType", "deleteRoomType"):
        if record_id:
            query(connection, "SELECT id FROM rooms WHERE room_type_id=%s ORDER BY id FOR UPDATE", [record_id])
        existing = query(connection, "SELECT * FROM room_types WHERE id=%s FOR UPDATE", [record_id]) if record_id else []
        if record_id and not existing:
            raise ValueError("Room type not found.")
        if method == "deleteRoomType":
            if query(connection, "SELECT id FROM rooms WHERE room_type_id=%s LIMIT 1", [record_id]):
                raise ValueError("This type is in use. Mark it inactive instead.")
            if not query(connection, "DELETE FROM room_types WHERE id=%s", [record_id])["count"]:
                raise ValueError("Room type not found.")
            audit(connection, actor, "room_type_deleted", "room_type", record_id, "Deleted an unreferenced room type.")
            return None
        values = data or {}
        price = str(values.get("price", ""))
        if not re.fullmatch(r"\d+(\.\d{1,2})?", price) or not 0 < Decimal(price) <= 10000:
            raise ValueError("Price must be positive, at most 10000, with up to two decimal places.")
        capacity = integer(values.get("capacity"), 1, 6, "Capacity")
        active_value = values.get("isActive", existing[0]["is_active"] if existing else True)
        choice(active_value, [True, False, "true", "false", 1, 0, "1", "0"], "active offering status")
        active = int(active_value in (True, "true", 1, "1"))
        if record_id:
            bookings = query(connection, "SELECT b.guest_count FROM reservations b JOIN rooms r ON r.id=b.room_id "
                             "WHERE r.room_type_id=%s AND b.status IN ('pending','confirmed','checked_in')", [record_id])
            if any(b["guest_count"] > capacity or not active for b in bookings):
                raise ValueError("The new capacity or inactive status conflicts with an active reservation.")
        fields = [required(values.get("name"), "room type", 50), price, capacity,
                  required(values.get("beds"), "beds", 60), required(values.get("description"), "description", 250), active]
        if existing:
            type_id = existing[0]["id"]
            query(connection, "UPDATE room_types SET name=%s,base_price=%s,capacity=%s,beds=%s,description=%s,is_active=%s WHERE id=%s", fields + [type_id])
        else:
            type_id = query(connection, "INSERT INTO room_types(name,base_price,capacity,beds,description,is_active) VALUES (%s,%s,%s,%s,%s,%s)", fields)["id"]
        audit(connection, actor, "room_type_saved", "room_type", type_id, f"Saved {fields[0]}; future rate {price} USD; existing booking rates unchanged.")
        return next(t for t in load_types(connection) if t["id"] == type_id)
    if method in ("saveStaff", "deleteStaff"):
        users = query(connection, "SELECT * FROM users WHERE display_code=%s AND role<>'customer' FOR UPDATE", [str(record_id)]) if record_id else []
        user = users[0] if users else None
        if record_id and not user:
            raise ValueError("Staff record not found.")
        if method == "deleteStaff":
            if not user:
                raise ValueError("Staff record not found.")
            if user["id"] == actor["id"]:
                raise ValueError("Cannot delete the current demo administrator.")
            refs = query(connection, "SELECT (SELECT COUNT(*) FROM reservations WHERE customer_id=%s OR created_by=%s) "
                         "+ (SELECT COUNT(*) FROM payments WHERE recorded_by=%s) "
                         "+ (SELECT COUNT(*) FROM activity_logs WHERE actor_id=%s) AS count", [user["id"]] * 4)[0]["count"]
            if refs:
                raise ValueError("This user has referenced history. Mark the account inactive instead.")
            query(connection, "DELETE FROM users WHERE id=%s", [user["id"]])
            audit(connection, actor, "staff_deleted", "user", user["id"], f"Deleted unreferenced staff profile {record_id}.")
            return None
        values = data or {}
        role = choice(values.get("role"), ["Receptionist", "Manager", "Admin"], "staff role").lower()
        status = choice(values.get("status"), ["Active", "Inactive"], "staff status").lower()
        if user and user["id"] == actor["id"] and (role != actor["role"] or status != "active"):
            raise ValueError("Keep the current demo administrator active with its existing role.")
        fields = [required(values.get("name"), "name"), email(values.get("email")), required(values.get("phone"), "phone", 25), role, status]
        new_password = values.get("password")
        password_hash = generate_password_hash(password(new_password)) if new_password else None
        if not user and not password_hash:
            raise ValueError("Enter a password for the new staff account.")
        if user:
            user_id = user["id"]
            query(connection, "UPDATE users SET full_name=%s,email=%s,phone=%s,role=%s,status=%s WHERE id=%s", fields + [user_id])
            if password_hash:
                query(connection, "UPDATE users SET password_hash=%s WHERE id=%s", [password_hash, user_id])
        else:
            user_id = query(connection, "INSERT INTO users(display_code,full_name,email,phone,role,status,password_hash) VALUES (%s,%s,%s,%s,%s,%s,%s)", ["TMP-" + secrets.token_hex(6)] + fields + [password_hash])["id"]
            query(connection, "UPDATE users SET display_code=%s WHERE id=%s", [f"S{user_id:03}", user_id])
        audit(connection, actor, "staff_saved", "user", user_id, f"Saved staff profile {fields[0]} with {role} role and {status} status.")
        return next(u for u in load_users(connection, True) if u["email"] == fields[1])
    raise ValueError("Unknown action.")


# 5. FLASK ROUTES: the browser sends JSON, Python calls MySQL, Flask returns JSON.
def session_actor(connection):
    if not session.get("user_id"):
        return None
    rows = query(connection, "SELECT id,display_code,full_name,role,status FROM users WHERE id=%s", [session["user_id"]])
    return rows[0] if rows and rows[0]["status"] == "active" and rows[0]["role"] == session.get("role") else None


def portal_for(role):
    return "receptionist" if role == "manager" else role


def login_location(portal, next_page):
    return f"/{portal}/index.html?" + urlencode({"page": "login", "next": next_page})


@app.get("/api/session")
def login_status():
    with database() as connection:
        actor = session_actor(connection)
    if not actor:
        session.clear()
        return jsonify(loggedIn=False, user=None)
    return jsonify(loggedIn=True, user={"id": actor["display_code"], "name": actor["full_name"], "role": actor["role"]})


@app.post("/api/login")
def login():
    values = request.get_json()
    role = values.get("role") if isinstance(values, dict) else None
    if role not in ACTORS:
        raise ValueError("Choose Customer, Receptionist, Admin, or Manager.")
    address = email(values.get("email"))
    supplied_password = values.get("password")
    if not isinstance(supplied_password, str) or not 1 <= len(supplied_password) <= 128:
        return jsonify(error="Incorrect email, password, or role."), 401
    with database() as connection:
        rows = query(connection, "SELECT id,display_code,full_name,role,status,password_hash FROM users WHERE email=%s", [address])
        if not rows or rows[0]["role"] != role or rows[0]["status"] != "active" or not rows[0]["password_hash"] or not check_password_hash(rows[0]["password_hash"], supplied_password):
            return jsonify(error="Incorrect email, password, or role."), 401
        actor = rows[0]
    return signed_in(actor)


def signed_in(actor):
    session.clear()
    session.update(user_id=actor["id"], role=actor["role"])
    return jsonify(loggedIn=True, user={"id": actor["display_code"], "name": actor["full_name"], "role": actor["role"]},
                   portal=f"/{portal_for(actor['role'])}/index.html?page=dashboard")


@app.post("/api/register")
def register():
    values = request.get_json()
    if not isinstance(values, dict):
        raise ValueError("Enter your account details.")
    name = required(values.get("name"), "name")
    address = email(values.get("email"))
    phone = required(values.get("phone"), "phone", 25)
    supplied_password = password(values.get("password"))
    if supplied_password != values.get("confirmPassword"):
        raise ValueError("The passwords do not match.")
    with database() as connection:
        user_id = query(connection, "INSERT INTO users(display_code,full_name,email,phone,password_hash,role,status) "
                        "VALUES (%s,%s,%s,%s,%s,'customer','active')",
                        ["TMP-" + secrets.token_hex(6), name, address, phone, generate_password_hash(supplied_password)])["id"]
        code = f"C{user_id:03}"
        query(connection, "UPDATE users SET display_code=%s WHERE id=%s", [code, user_id])
        actor = {"id": user_id, "display_code": code, "full_name": name, "role": "customer"}
        audit(connection, actor, "account_created", "user", user_id, "Created a customer account.")
    return signed_in(actor), 201


@app.post("/api/logout")
def logout():
    session.clear()
    return jsonify(loggedIn=False, user=None)


@app.before_request
def local_requests_only():
    host = request.host.split(":")[0]
    if host not in ("localhost", "127.0.0.1"):
        return jsonify(error="Open this local project using localhost or 127.0.0.1."), 403
    origin = request.headers.get("Origin")
    if request.path.startswith("/api/") and origin and origin not in {
        "http://" + request.host, "http://localhost:" + request.host.rsplit(":", 1)[-1],
        "http://127.0.0.1:" + request.host.rsplit(":", 1)[-1]}:
        return jsonify(error="Cross-origin requests are not allowed."), 403


@app.after_request
def response_headers(response):
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Cache-Control"] = "no-store" if request.path.startswith("/api/") else "no-cache"
    return response


@app.post("/api/<role>/<method>")
def hotel_api(role, method):
    if method not in PERMISSIONS.get(role, set()):
        raise ValueError("This operation is not available in the selected demo role.")
    if request.mimetype != "application/json":
        return jsonify(error="Send application/json."), 415
    args = request.get_json()
    if not isinstance(args, list) or len(args) > 3:
        raise ValueError("Expected an array of API arguments.")
    with database() as connection:
        actor = None
        if role != "public":
            actor = session_actor(connection)
            if not actor:
                return jsonify(error="Please log in before opening your portal."), 401
            if role != actor["role"] and not (role == "receptionist" and actor["role"] == "manager"):
                return jsonify(error="Log in with the correct role to use this portal."), 403
        filters = dict(args[0]) if args and isinstance(args[0], dict) else {}
        if actor:
            filters["profileId"] = actor["display_code"]
        if role == "customer":
            filters["customerId"] = actor["display_code"]
        result = read_records(connection, method, filters) if method.startswith("load") else run_action(connection, actor, method, args)
    return jsonify(json_values(result))


@app.get("/api/database")
def database_viewer():
    table = request.args.get("table")
    if table and table not in TABLES:
        raise ValueError("Unknown table.")
    with database() as connection:
        actor = session_actor(connection)
        if not actor:
            return jsonify(error="Log in as Admin to view database tables."), 401
        if actor["role"] != "admin":
            return jsonify(error="Only the Admin portal can open the database viewer."), 403
        result = {"engine": "MySQL", "database": connection.db.decode(), "timezone": HOTEL_TIMEZONE,
                  "tables": [{"name": name, "count": query(connection, f"SELECT COUNT(*) AS count FROM `{name}`")[0]["count"]} for name in TABLES]}
        if table:
            columns = query(connection, "SELECT COLUMN_NAME AS name,COLUMN_TYPE AS type,(IS_NULLABLE='NO') AS `notnull`,(COLUMN_KEY='PRI') AS pk "
                            "FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=%s ORDER BY ORDINAL_POSITION", [table])
            visible = [c for c in columns if c["name"] != "password_hash"]
            names = ",".join("`" + c["name"] + "`" for c in visible)
            order = "room_id,amenity_id" if table == "room_amenities" else "id"
            sql = f"SELECT {names} FROM `{table}` ORDER BY {order} LIMIT 200"
            result.update(table=table, columns=visible, query=sql + ";", rows=query(connection, sql),
                          relationships=query(connection, "SELECT COLUMN_NAME AS `from`,REFERENCED_TABLE_NAME AS `table`,REFERENCED_COLUMN_NAME AS `to` "
                                              "FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=%s AND REFERENCED_TABLE_NAME IS NOT NULL", [table]))
    return jsonify(json_values(result))


@app.get("/")
@app.get("/<path:filename>")
def website(filename="index.html"):
    if filename.endswith("/"):
        filename += "index.html"
    allowed_pages = {"index.html", "customer/index.html", "receptionist/index.html", "admin/index.html", "database/index.html"}
    allowed_asset = filename.startswith(("assets/", "css/", "js/")) and Path(filename).suffix.lower() in {".jpg", ".png", ".svg", ".webp", ".css", ".js"}
    if filename not in allowed_pages and not allowed_asset:
        return jsonify(error="Not found."), 404
    portal = filename.split("/")[0]
    if portal in {"customer", "receptionist", "admin", "database"} and filename.endswith("index.html"):
        page = request.args.get("page", "login")
        if portal == "database" or page not in {"login", "register"}:
            with database() as connection:
                actor = session_actor(connection)
            expected = "admin" if portal == "database" else portal
            if not actor or portal_for(actor["role"]) != expected:
                return redirect(login_location(expected, request.full_path.rstrip("?")), code=303)
    return send_from_directory(ROOT, filename)


@app.errorhandler(Exception)
def errors(error):
    if isinstance(error, HTTPException):
        return jsonify(error=error.description), error.code
    if isinstance(error, ValueError):
        return jsonify(error=str(error)), 400
    if isinstance(error, pymysql.MySQLError):
        code = error.args[0] if error.args else None
        messages = {1062: "That email, room number, or category name is already in use.",
                    1451: "This record has referenced history; mark it inactive instead.",
                    1205: "Another change is in progress. Please try again.",
                    1213: "Another change is in progress. Please try again."}
        return jsonify(error=messages.get(code, "MySQL request failed. Check that MySQL is running and the schema is installed.")), 400
    app.logger.exception("Request failed")
    return jsonify(error="Request failed. Check the Python terminal."), 500


if __name__ == "__main__":
    with database() as connection:
        query(connection, "SELECT id FROM users LIMIT 1")
    port = int(os.environ.get("PORT", "5000"))
    print(f"Hotel California Flask: http://localhost:{port}")
    app.run(host="127.0.0.1", port=port, debug=False)
