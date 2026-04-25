# Generated migration for HRUser model

from django.db import migrations, models
import uuid


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0002_add_candidates_and_notifications'),
    ]

    operations = [
        migrations.CreateModel(
            name='HRUser',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('email', models.EmailField(max_length=254, unique=True)),
                ('name', models.CharField(max_length=200)),
                ('google_id', models.CharField(max_length=200, unique=True)),
                ('access_token', models.TextField(blank=True, null=True)),
                ('refresh_token', models.TextField(blank=True, null=True)),
                ('token_expiry', models.DateTimeField(blank=True, null=True)),
                ('profile_picture', models.URLField(blank=True, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('last_login', models.DateTimeField(auto_now=True)),
            ],
            options={
                'db_table': 'hr_users',
            },
        ),
    ]
