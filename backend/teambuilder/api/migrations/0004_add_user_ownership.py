# Generated migration for multi-tenancy (user ownership)

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('api', '0003_add_hr_users'),
    ]

    operations = [
        migrations.AddField(
            model_name='candidate',
            name='hr_user',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='candidates', to='api.hruser'),
        ),
        migrations.AddField(
            model_name='usersession',
            name='hr_user',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='sessions', to='api.hruser'),
        ),
    ]
