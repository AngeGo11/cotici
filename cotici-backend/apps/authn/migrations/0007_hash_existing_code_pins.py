from django.contrib.auth.hashers import identify_hasher, make_password
from django.db import migrations


def hash_plaintext_pins(apps, schema_editor):
    User = apps.get_model("authn", "User")
    for user in User.objects.exclude(code_pin="").iterator():
        try:
            identify_hasher(user.code_pin)
            continue  # already hashed
        except ValueError:
            pass
        user.code_pin = make_password(user.code_pin)
        user.save(update_fields=["code_pin"])


def noop_reverse(apps, schema_editor):
    # Hashing is one-way; nothing to revert to.
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('authn', '0006_alter_user_code_pin'),
    ]

    operations = [
        migrations.RunPython(hash_plaintext_pins, noop_reverse),
    ]
