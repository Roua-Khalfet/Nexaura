# Generated migration to update CandidateNotification status choices

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0005_add_candidate_notes'),
    ]

    operations = [
        migrations.AlterField(
            model_name='candidatenotification',
            name='status',
            field=models.CharField(
                choices=[
                    ('pending', 'Pending Response'),
                    ('interested', 'Interested'),
                    ('not_interested', 'Not Interested'),
                    ('interview_scheduled', 'Interview Scheduled'),
                    ('interviewed', 'Interviewed'),
                    ('offer_made', 'Offer Made'),
                    ('hired', 'Hired')
                ],
                default='pending',
                max_length=20
            ),
        ),
    ]
