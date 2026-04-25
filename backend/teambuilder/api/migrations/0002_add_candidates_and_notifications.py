# Generated migration for candidates and notifications

from django.db import migrations, models
import django.db.models.deletion
import uuid


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0001_initial'),
    ]

    operations = [
        migrations.CreateModel(
            name='Candidate',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('name', models.CharField(max_length=200)),
                ('email', models.EmailField(blank=True, max_length=200, null=True)),
                ('phone', models.CharField(blank=True, max_length=50, null=True)),
                ('skills', models.JSONField(default=list)),
                ('experience_years', models.IntegerField(blank=True, null=True)),
                ('seniority', models.CharField(blank=True, max_length=20, null=True)),
                ('education', models.TextField(blank=True, null=True)),
                ('cv_text', models.TextField(blank=True, null=True)),
                ('cv_file_path', models.CharField(blank=True, max_length=500, null=True)),
                ('consent_given', models.BooleanField(default=False)),
                ('consent_date', models.DateTimeField(blank=True, null=True)),
                ('availability_status', models.CharField(default='available', max_length=20)),
                ('preferred_contact', models.CharField(default='email', max_length=20)),
                ('notification_consent', models.BooleanField(default=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('expires_at', models.DateTimeField(blank=True, null=True)),
            ],
            options={
                'db_table': 'candidates',
            },
        ),
        migrations.CreateModel(
            name='CandidateNotification',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('role_title', models.CharField(max_length=200)),
                ('notification_type', models.CharField(max_length=20)),
                ('sent_at', models.DateTimeField(auto_now_add=True)),
                ('status', models.CharField(default='sent', max_length=20)),
                ('response_token', models.CharField(max_length=100, unique=True)),
                ('responded_at', models.DateTimeField(blank=True, null=True)),
                ('message', models.TextField(blank=True, null=True)),
                ('candidate', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='notifications', to='api.candidate')),
                ('session', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, to='api.usersession')),
            ],
            options={
                'db_table': 'candidate_notifications',
            },
        ),
    ]
