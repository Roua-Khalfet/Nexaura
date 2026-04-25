# Generated migration to add sent_to_email field to CandidateNotification

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0006_update_notification_status_choices'),
    ]

    operations = [
        migrations.AddField(
            model_name='candidatenotification',
            name='sent_to_email',
            field=models.EmailField(blank=True, max_length=200, null=True),
        ),
    ]
