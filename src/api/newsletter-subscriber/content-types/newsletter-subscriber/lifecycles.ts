export default {
    async beforeCreate(event) {
      const { data } = event.params;
      if (data.email) data.email = data.email.toLowerCase();
    },
    async beforeUpdate(event) {
      const { data } = event.params;
      if (data.email) data.email = data.email.toLowerCase();
    }
  };
  